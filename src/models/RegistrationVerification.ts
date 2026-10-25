import mongoose, { type Model } from "mongoose";

interface IRegistrationVerification {
  name: string;
  email: string;
  passwordHash: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
}

const registrationVerificationSchema = new mongoose.Schema<IRegistrationVerification>(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    codeHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

const RegistrationVerificationModel: Model<IRegistrationVerification> =
  mongoose.models.RegistrationVerification ||
  mongoose.model<IRegistrationVerification>("RegistrationVerification", registrationVerificationSchema);

module.exports = RegistrationVerificationModel;

export {};
