import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { REPO_TYPES, type RepoType } from '../types.js';

export interface RepoConfigDoc {
  repoUrl: string;
  fullName: string;
  owner: string;
  name: string;
  targetBranch: string;
  type: RepoType;
  enabled: boolean;
  /**
   * Per-repo HMAC secret, matching what was typed into GitHub's webhook form.
   * `select: false` so it never leaves the DB unless explicitly asked for --
   * only the signature verifier asks.
   */
  webhookSecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

const repoConfigSchema = new Schema<RepoConfigDoc>(
  {
    repoUrl: { type: String, required: true, trim: true },
    fullName: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    owner: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    targetBranch: { type: String, required: true, trim: true, default: 'main' },
    type: { type: String, required: true, enum: REPO_TYPES },
    enabled: { type: Boolean, required: true, default: true },
    webhookSecret: { type: String, select: false },
  },
  { timestamps: true, collection: 'repo_configs' },
);

export type RepoConfigModel = Model<RepoConfigDoc>;
export type RepoConfigHydrated = HydratedDocument<RepoConfigDoc>;

export const RepoConfigModel: RepoConfigModel =
  (model<RepoConfigDoc>('RepoConfig', repoConfigSchema));
