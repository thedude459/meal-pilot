import { sql } from "drizzle-orm";
import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export const familyMembers = sqliteTable(
  "family_members",
  {
    id: text("id").primaryKey(),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id),
    displayName: text("display_name").notNull(),
    displayNameKey: text("display_name_key").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueNamePerHousehold: uniqueIndex("family_members_household_name_key").on(
      table.householdId,
      table.displayNameKey,
    ),
  }),
);

export const preferenceProfiles = sqliteTable(
  "preference_profiles",
  {
    id: text("id").primaryKey(),
    familyMemberId: text("family_member_id")
      .notNull()
      .references(() => familyMembers.id, { onDelete: "cascade" }),
    likesJson: text("likes_json").notNull().default("[]"),
    dislikesJson: text("dislikes_json").notNull().default("[]"),
    dietaryRestrictionIdsJson: text("dietary_restriction_ids_json").notNull().default("[]"),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => ({
    uniqueMember: uniqueIndex("preference_profiles_member_key").on(table.familyMemberId),
  }),
);
