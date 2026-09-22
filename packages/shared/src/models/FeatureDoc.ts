import { Schema, model, type HydratedDocument, type Model } from 'mongoose';
import { FEATURE_DOC_SOURCES, type FeatureDocSource } from '../types.js';

export interface FeatureDocRevisionDoc {
  commitSha: string;
  source: FeatureDocSource;
  summary: string;
  previousContent: string;
  model: string;
  createdAt: Date;
}

export interface FeatureDocDoc {
  repoConfigId: Schema.Types.ObjectId | string;
  repoFullName: string;
  branch: string;
  content: string;
  lastCommitSha: string | null;
  revisionCount: number;
  history: FeatureDocRevisionDoc[];
  createdAt: Date;
  updatedAt: Date;
}

const revisionSchema = new Schema<FeatureDocRevisionDoc>(
  {
    commitSha: { type: String, required: true },
    // Defaulted so the worker's existing $push (which doesn't set it) and any
    // revision already in the database both read back as 'push'.
    source: { type: String, required: true, enum: FEATURE_DOC_SOURCES, default: 'push' },
    summary: { type: String, required: true, default: '' },
    previousContent: { type: String, required: true, default: '' },
    model: { type: String, required: true, default: 'unknown' },
    createdAt: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const featureDocSchema = new Schema<FeatureDocDoc>(
  {
    // One doc per repo -- the worker upserts on this key and mutates `content`
    // in place rather than inserting a new document per push.
    repoConfigId: { type: Schema.Types.ObjectId, ref: 'RepoConfig', required: true, unique: true, index: true },
    repoFullName: { type: String, required: true, index: true },
    branch: { type: String, required: true },
    content: { type: String, required: true, default: '' },
    lastCommitSha: { type: String, default: null },
    revisionCount: { type: Number, required: true, default: 0 },
    history: { type: [revisionSchema], default: [] },
  },
  { timestamps: true, collection: 'feature_docs' },
);

export type FeatureDocModel = Model<FeatureDocDoc>;
export type FeatureDocHydrated = HydratedDocument<FeatureDocDoc>;

export const FeatureDocModel: FeatureDocModel = model<FeatureDocDoc>('FeatureDoc', featureDocSchema);
