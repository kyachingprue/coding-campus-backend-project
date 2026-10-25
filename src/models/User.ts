import mongoose, { type HydratedDocument, type Model } from "mongoose";
import bcrypt from "bcryptjs";
import type { UserRole } from "../types/express";

export interface IUser {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  avatarUrl: string;
  coverUrl: string;
  bio: string;
  headline: string;
  location: string;
  education: string;
  currentFocus: string;
  learningGoal: string;
  skills: string[];
  github: string;
  linkedin: string;
  website: string;
  projectName: string;
  projectDescription: string;
  availability: string;
  isActive: boolean;
  passwordResetTokenHash?: string;
  passwordResetExpiresAt?: Date;
  lastLoginAt?: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

type UserDocument = HydratedDocument<IUser>;

const userSchema = new mongoose.Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ["student", "instructor", "admin"], default: "student" },
    avatarUrl: { type: String, default: "" },
    coverUrl: { type: String, default: "" },
    bio: { type: String, maxlength: 500, default: "" },
    headline: { type: String, maxlength: 120, default: "" },
    location: { type: String, maxlength: 120, default: "" },
    education: { type: String, maxlength: 160, default: "" },
    currentFocus: { type: String, maxlength: 160, default: "" },
    learningGoal: { type: String, maxlength: 500, default: "" },
    skills: { type: [String], default: [] },
    github: { type: String, maxlength: 300, default: "" },
    linkedin: { type: String, maxlength: 300, default: "" },
    website: { type: String, maxlength: 300, default: "" },
    projectName: { type: String, maxlength: 160, default: "" },
    projectDescription: { type: String, maxlength: 1000, default: "" },
    availability: { type: String, maxlength: 100, default: "" },
    isActive: { type: Boolean, default: true },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    lastLoginAt: Date,
  },
  { timestamps: true, toJSON: { virtuals: true, transform: (_doc: unknown, value: Record<string, unknown>) => {
    delete value.password;
    delete value.passwordResetTokenHash;
    delete value.passwordResetExpiresAt;
    delete value.__v;
    return value;
  } } }
);

userSchema.pre("save", async function hashPassword(this: UserDocument) {
  if (!this.isModified("password")) return;
  if (this.$locals.passwordIsHashed) {
    this.$locals.passwordIsHashed = false;
    return;
  }
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function comparePassword(this: UserDocument, candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

const UserModel: Model<IUser> = mongoose.model<IUser>("User", userSchema);
module.exports = UserModel;

export {};
