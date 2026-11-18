import { randomBytes } from "node:crypto";
import type { UserRole } from "../types/express";
const User = require("../models/User");
const SupportCall = require("../models/SupportCall");
import HttpError = require("../utils/httpError");
import asyncHandler = require("../utils/asyncHandler");
import { requireUser, requireValidated } from "../utils/request";

const contactRoles: Record<UserRole, UserRole[]> = {
  student: ["instructor", "admin"],
  instructor: ["student", "admin"],
  admin: ["student", "instructor"],
};

function serializeCall(call: any, currentUserId: string) {
  const initiator = call.initiator;
  const recipient = call.recipient;
  return {
    id: String(call._id),
    roomName: call.roomName,
    topic: call.topic,
    status: call.status,
    createdAt: call.createdAt,
    expiresAt: call.expiresAt,
    isIncoming: String(recipient?._id || recipient) === currentUserId,
    initiator: { id: String(initiator?._id || initiator), name: initiator?.name || "Campus member", role: initiator?.role },
    recipient: { id: String(recipient?._id || recipient), name: recipient?.name || "Campus member", role: recipient?.role },
  };
}

function populatedCallQuery(query: any) {
  return query.populate("initiator", "name role").populate("recipient", "name role");
}

exports.listContacts = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const contacts = await User.find({
    _id: { $ne: user.id },
    role: { $in: contactRoles[user.role] },
    isActive: true,
  })
    .select("name role avatarUrl")
    .sort({ name: 1 })
    .limit(500)
    .lean();
  res.json({
    contacts: contacts.map((contact: any) => ({
      id: String(contact._id),
      name: contact.name,
      role: contact.role,
      avatarUrl: contact.avatarUrl || "",
    })),
  });
});

exports.listCalls = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const now = new Date();
  const calls = await populatedCallQuery(SupportCall.find({
    $or: [{ initiator: user.id }, { recipient: user.id }],
    status: { $in: ["ringing", "accepted"] },
    expiresAt: { $gt: now },
  }).sort({ updatedAt: -1 }).limit(30));
  res.json({ calls: calls.map((call: any) => serializeCall(call, String(user.id))) });
});

exports.createCall = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { recipientId, topic = "" } = requireValidated<{ recipientId: string; topic?: string }>(req).body;
  const recipient = await User.findOne({
    _id: recipientId,
    role: { $in: contactRoles[user.role] },
    isActive: true,
  }).select("_id name role");
  if (!recipient) throw new HttpError(404, "That campus member is unavailable for support calls.");

  const call = await SupportCall.create({
    initiator: user.id,
    recipient: recipient.id,
    roomName: `coding-campus-${randomBytes(24).toString("hex")}`,
    topic,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  const populatedCall = await populatedCallQuery(SupportCall.findById(call.id));
  if (!populatedCall) throw new HttpError(500, "The support call was created, but its details could not be loaded.");
  req.io?.to(`user:${recipient.id}`).emit("support:call", {
    id: String(call._id),
    initiatorName: user.name,
    topic: call.topic,
    expiresAt: call.expiresAt,
  });
  res.status(201).json({ call: serializeCall(populatedCall, String(user.id)) });
});

exports.updateCall = asyncHandler(async (req, res) => {
  const user = requireUser(req);
  const { action } = requireValidated<{ action: "accept" | "decline" | "end" }>(req).body;
  const call = await SupportCall.findOne({
    _id: req.params.id,
    $or: [{ initiator: user.id }, { recipient: user.id }],
  });
  if (!call) throw new HttpError(404, "Support call not found.");
  if (call.expiresAt <= new Date() || !["ringing", "accepted"].includes(call.status)) {
    throw new HttpError(409, "This support call is no longer active.");
  }

  const isRecipient = String(call.recipient) === String(user.id);
  if (action !== "end" && (!isRecipient || call.status !== "ringing")) {
    throw new HttpError(403, "Only the invited person can accept or decline this call.");
  }
  if (action === "accept") {
    call.status = "accepted";
    call.expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
  } else if (action === "decline") {
    call.status = "declined";
  } else {
    call.status = "ended";
  }
  await call.save();

  const otherUserId = isRecipient ? call.initiator : call.recipient;
  req.io?.to(`user:${otherUserId}`).emit("support:call-updated", {
    id: String(call._id),
    status: call.status,
  });
  const populatedCall = await populatedCallQuery(SupportCall.findById(call.id));
  if (!populatedCall) throw new HttpError(404, "Support call is no longer available.");
  res.json({ call: serializeCall(populatedCall, String(user.id)) });
});

module.exports = {
  listContacts: exports.listContacts,
  listCalls: exports.listCalls,
  createCall: exports.createCall,
  updateCall: exports.updateCall,
};

export {};
