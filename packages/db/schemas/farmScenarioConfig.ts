import mongoose, { type Document, Schema, model } from "mongoose";

export interface IFarmScenarioConfigSchema {
  // Core relationships
  user: mongoose.Schema.Types.ObjectId | string;
  parcel: mongoose.Schema.Types.ObjectId | string; // The farm
  name?: string;
  description?: string;
  
  // Scenario selections for each field (layer)
  fieldScenarios: Array<{
    layer: mongoose.Schema.Types.ObjectId | string; // The field
    project?: mongoose.Schema.Types.ObjectId | string; // Selected scenario/project for this field
    enabled: boolean; // Whether this field should be displayed
    displayOrder?: number; // Order to display fields
  }>;
  
  // Display configuration
  displaySettings?: {
    show3D?: boolean;
    showLabels?: boolean;
    mapStyle?: string;
    initialZoom?: number;
    initialBearing?: number;
    initialPitch?: number;
  };

  // Metadata
  isPublic?: boolean;
  showOfferButton?: boolean;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type FarmScenarioConfigDocument = IFarmScenarioConfigSchema & Document;

const farmScenarioConfigSchema = new mongoose.Schema<FarmScenarioConfigDocument>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    parcel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parcel",
      required: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    fieldScenarios: [
      {
        layer: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Layer",
          required: true,
        },
        project: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Project",
        },
        enabled: {
          type: Boolean,
          default: true,
        },
        displayOrder: {
          type: Number,
        },
      },
    ],
    displaySettings: {
      show3D: {
        type: Boolean,
        default: false,
      },
      showLabels: {
        type: Boolean,
        default: true,
      },
      mapStyle: {
        type: String,
        default: "satellite",
      },
      initialZoom: {
        type: Number,
        default: 14,
      },
      initialBearing: {
        type: Number,
        default: 0,
      },
      initialPitch: {
        type: Number,
        default: 0,
      },
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    showOfferButton: {
      type: Boolean,
      default: true,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for user and parcel
farmScenarioConfigSchema.index({ user: 1, parcel: 1 });

// Index for public configs
farmScenarioConfigSchema.index({ isPublic: 1 });

// Virtual for populating references
farmScenarioConfigSchema.virtual("parcelData", {
  ref: "Parcel",
  localField: "parcel",
  foreignField: "_id",
  justOne: true,
});

farmScenarioConfigSchema.virtual("fieldData", {
  ref: "Layer",
  localField: "fieldScenarios.layer",
  foreignField: "_id",
});

farmScenarioConfigSchema.virtual("projectData", {
  ref: "Project",
  localField: "fieldScenarios.project",
  foreignField: "_id",
});

export const FarmScenarioConfig = model<FarmScenarioConfigDocument>(
  "FarmScenarioConfig",
  farmScenarioConfigSchema
);

export default FarmScenarioConfig;