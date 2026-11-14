import { z } from "zod";
import {
  developmentStatus, displayOrder, httpUrl, longText, mediumText, shortText, slug, uuid, visibility,
} from "@/lib/validation/common";

const technologies = z.array(z.string().trim().min(1).max(60)).max(50);

export const createProjectSchema = z.object({
  title: shortText,
  slug: slug.optional(), // derived from title when omitted
  short_description: mediumText.nullish(),
  detailed_description: longText.nullish(),
  problem_statement: longText.nullish(),
  proposed_solution: longText.nullish(),
  architecture_description: longText.nullish(),
  role_and_contribution: longText.nullish(),
  category: z.string().trim().max(80).nullish(),
  live_demo_url: httpUrl.nullish(),
  development_status: developmentStatus.default("planning"),
  display_order: displayOrder.default(0),
  technologies: technologies.default([]),
});
// Publication state, visibility and featured are changed ONLY via dedicated actions,
// never through generic create/update, so a project cannot be published by accident.
export const updateProjectSchema = createProjectSchema.partial().strict();

export const publicationActionSchema = z.object({ action: z.enum(["publish", "unpublish"]) });
export const featureActionSchema = z.object({ featured: z.boolean() });
export const reorderSchema = z.object({
  items: z.array(z.object({ id: uuid, display_order: displayOrder })).min(1).max(200),
});
export const importRepositorySchema = z.object({
  title: shortText.optional(),
  slug: slug.optional(),
  category: z.string().trim().max(80).nullish(),
});
export const attachMediaSchema = z.object({
  media_asset_id: uuid,
  role: z.enum(["thumbnail", "screenshot", "architecture_diagram"]),
  caption: z.string().trim().max(300).nullish(),
  display_order: displayOrder.default(0),
});
export const detachMediaSchema = z.object({ project_media_id: uuid });

export const adminProjectListQuery = z.object({
  publication_state: z.enum(["draft", "published", "unpublished"]).optional(),
  development_status: developmentStatus.optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export { visibility };
