import { z } from "zod";
import type {
  BackgroundMusic,
  DemoAction,
  DemoDefinition,
  DemoStep,
  DragConfig,
  MediaConfig,
  MusicEndPoint,
  MusicStartPoint,
  StepTarget,
  VideoSegment,
  WaitCondition,
} from "./types";

export const DEMO_SCHEMA_VERSION = 1;

type DemoDefinitionInput = Omit<DemoDefinition, "version"> & { version?: number };

const stepTargetSchema: z.ZodType<StepTarget> = z
  .object({
    type: z.enum(["button", "link", "input", "text", "selector"]),
    text: z.string().optional(),
    selector: z.string().optional(),
    name: z.string().optional(),
  })
  .strict()
  .superRefine((target, ctx) => {
    switch (target.type) {
      case "selector":
        if (!target.selector) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "selector target requires selector",
          });
        }
        break;
      case "text":
        if (!target.text) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "text target requires text",
          });
        }
        break;
      case "button":
      case "link":
      case "input":
        if (!target.text && !target.name && !target.selector) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "target requires text, name, or selector",
          });
        }
        break;
    }
  });

const waitConditionSchema: z.ZodType<WaitCondition> = z
  .object({
    type: z.enum(["text", "selector", "navigation", "idle", "selectorHidden", "textHidden"]),
    value: z.string().optional(),
    timeout: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .superRefine((condition, ctx) => {
    if (["text", "selector", "selectorHidden", "textHidden"].includes(condition.type)) {
      if (!condition.value) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `wait condition '${condition.type}' requires value`,
        });
      }
    }
  });

const dragConfigSchema: z.ZodType<DragConfig> = z
  .object({
    deltaX: z.coerce.number(),
    deltaY: z.coerce.number(),
    steps: z.coerce.number().int().positive().optional(),
  })
  .strict();

const waitActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("wait"),
    duration: z.coerce.number().nonnegative().optional(),
    waitFor: waitConditionSchema.optional(),
  })
  .strict()
  .superRefine((action, ctx) => {
    if (action.duration === undefined && action.waitFor === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "wait action requires duration or waitFor",
      });
    }
  });

const navigateActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("navigate"),
    path: z.string().min(1),
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const clickActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("click"),
    target: stepTargetSchema,
    highlight: z.boolean().optional(),
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const typeActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("type"),
    target: stepTargetSchema,
    text: z.string(),
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const uploadActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("upload"),
    file: z.string().min(1),
    target: stepTargetSchema.optional(),
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const hoverActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("hover"),
    target: stepTargetSchema,
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const scrollActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("scroll"),
    duration: z.coerce.number().optional(),
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const scrollToActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("scrollTo"),
    target: stepTargetSchema,
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const dragActionSchema: z.ZodType<DemoAction> = z
  .object({
    action: z.literal("drag"),
    target: stepTargetSchema,
    drag: dragConfigSchema,
    waitFor: waitConditionSchema.optional(),
  })
  .strict();

const actionSchema: z.ZodType<DemoAction> = z.union([
  navigateActionSchema,
  clickActionSchema,
  typeActionSchema,
  uploadActionSchema,
  waitActionSchema,
  hoverActionSchema,
  scrollActionSchema,
  scrollToActionSchema,
  dragActionSchema,
]);

const demoStepSchema: z.ZodType<DemoStep> = z
  .object({
    id: z.string().min(1),
    script: z.string(),
    actions: z.array(actionSchema),
  })
  .strict();

const videoSegmentSchema: z.ZodType<VideoSegment> = z
  .object({
    file: z.string().min(1),
    duration: z.coerce.number().positive().optional(),
    fade: z.boolean().optional(),
    fadeDuration: z.coerce.number().positive().optional(),
  })
  .strict();

const musicStartPointSchema: z.ZodType<MusicStartPoint> = z.union([
  z.object({ type: z.literal("beginning") }).strict(),
  z.object({ type: z.literal("afterIntro") }).strict(),
  z.object({ type: z.literal("step"), stepId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("time"), seconds: z.coerce.number().nonnegative() }).strict(),
]);

const musicEndPointSchema: z.ZodType<MusicEndPoint> = z.union([
  z.object({ type: z.literal("end") }).strict(),
  z.object({ type: z.literal("beforeOutro") }).strict(),
  z.object({ type: z.literal("step"), stepId: z.string().min(1) }).strict(),
  z.object({ type: z.literal("time"), seconds: z.coerce.number().nonnegative() }).strict(),
]);

const backgroundMusicSchema: z.ZodType<BackgroundMusic> = z
  .object({
    file: z.string().min(1),
    volume: z.coerce.number().min(0).max(1).optional(),
    startAt: musicStartPointSchema.optional(),
    endAt: musicEndPointSchema.optional(),
    loop: z.boolean().optional(),
    fadeIn: z.coerce.number().nonnegative().optional(),
    fadeOut: z.coerce.number().nonnegative().optional(),
  })
  .strict();

const mediaConfigSchema: z.ZodType<MediaConfig> = z
  .object({
    intro: videoSegmentSchema.optional(),
    outro: videoSegmentSchema.optional(),
    backgroundMusic: backgroundMusicSchema.optional(),
  })
  .strict();

export const demoDefinitionSchema: z.ZodType<
  DemoDefinition,
  z.ZodTypeDef,
  DemoDefinitionInput
> = z
  .object({
    version: z.coerce.number().int().positive().default(DEMO_SCHEMA_VERSION),
    name: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    steps: z.array(demoStepSchema),
    media: mediaConfigSchema.optional(),
  })
  .strict();

export function formatValidationError(error: unknown): string {
  if (!error || typeof error !== "object" || !("issues" in error)) {
    return "Invalid demo definition";
  }
  const issues = (error as z.ZodError).issues;
  return issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseDemoDefinition(input: unknown) {
  return demoDefinitionSchema.parse(input);
}

export function safeParseDemoDefinition(input: unknown) {
  return demoDefinitionSchema.safeParse(input);
}
