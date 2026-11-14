import { z } from "zod";
import {
  developmentStatus, displayOrder, httpOrMailtoUrl, httpUrl, isoDate, longText, mediumText, shortText, uuid, visibility,
} from "@/lib/validation/common";

export const skillSchema = z.object({
  name: shortText,
  category: shortText,
  related_technologies: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  experience_level: z.enum(["beginner", "intermediate", "advanced", "expert"]).nullish(),
  display_order: displayOrder.default(0),
  visibility: visibility.default("public"),
});

export const achievementSchema = z
  .object({
    title: shortText,
    organisation: z.string().trim().max(200).nullish(),
    description: longText.nullish(),
    achieved_on: isoDate.nullish(),
    recognition_type: z.enum(["award", "finalist", "participation", "certification", "publication", "leadership", "other"]).default("other"),
    media_asset_id: uuid.nullish(),
    verification_status: z.enum(["unverified", "verified"]).default("unverified"),
    display_order: displayOrder.default(0),
    visibility: visibility.default("hidden"),
  })
  .refine((a) => a.visibility === "hidden" || a.verification_status === "verified", {
    path: ["visibility"],
    message: "Only verified achievements can be made public.",
  });

export const experienceSchema = z
  .object({
    organisation: shortText,
    position: shortText,
    description: longText.nullish(),
    start_date: isoDate.nullish(),
    end_date: isoDate.nullish(),
    links: z.array(z.object({ label: z.string().trim().min(1).max(100), url: httpUrl })).max(10).default([]),
    display_order: displayOrder.default(0),
    visibility: visibility.default("hidden"),
  })
  .refine((e) => !e.start_date || !e.end_date || e.end_date >= e.start_date, {
    path: ["end_date"],
    message: "End date must not be before start date.",
  });

export const opportunitySchema = z.object({
  category: shortText,
  description: mediumText.nullish(),
  availability: z.string().trim().max(200).nullish(),
  display_order: displayOrder.default(0),
  visibility: visibility.default("hidden"),
});

export const socialLinkSchema = z.object({
  platform: shortText,
  url: httpOrMailtoUrl,
  label: z.string().trim().max(100).nullish(),
  highlight: mediumText.nullish(),
  display_order: displayOrder.default(0),
  visibility: visibility.default("public"),
});

export const activitySchema = z.object({
  title: shortText,
  description: mediumText.nullish(),
  current_focus: z.string().trim().max(300).nullish(),
  development_status: developmentStatus.default("in_progress"),
  project_id: uuid.nullish(),
  display_order: displayOrder.default(0),
  visibility: visibility.default("hidden"),
});
