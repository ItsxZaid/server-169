import {
  ActionRowBuilder,
  ButtonInteraction,
  EmbedBuilder,
  MessageFlags,
  ButtonStyle,
  ButtonBuilder,
  Role,
} from "discord.js";
import { CustomClient, DB } from "../types";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";

export async function execute(
  interaction: ButtonInteraction,
  db: DB,
  client: CustomClient,
) {
  const [action, userId] = interaction.customId.split(":");
  const registerRoleId = process.env.REGISTER_ROLE_ID;

  try {
    await interaction.deferUpdate();

    const approvedUser = await db
      .select()
      .from(users)
      .where(eq(users.user_discord_id, userId))
      .limit(1);

    if (approvedUser.length > 0) {
      const member = await interaction.guild?.members.fetch(userId);
      if (!member) {
        console.warn(`[WARN] Guild member with ID ${userId} not found`);
        await interaction.editReply({
          content: "Guild member not found.",
          components: [],
        });
        return;
      }

      const serverChannel = interaction.guild?.channels.cache.get(
        String(approvedUser[0].server),
      );

      if (serverChannel) {
        let serverRole = interaction.guild?.roles.cache.find(
          (role) => role.name === serverChannel.name,
        );
        if (serverRole) {
          await member.roles.add(serverRole);
        } else {
          serverRole = interaction.guild?.roles.cache.find(
            (role) => role.name === approvedUser[0].rank,
          );
          if (serverRole) {
            await member.roles.add(serverRole);
          } else {
            console.warn("[WARN] No matching serverRole found to add");
          }
        }
      } else {
        console.warn(
          "[WARN] Server channel not found, skipping serverRole assignment",
        );
      }

      const allianceChannel = interaction.guild?.channels.cache.get(
        String(approvedUser[0].alliance),
      );

      if (allianceChannel) {
        const alli = allianceChannel.name.split(" ")[0]?.toUpperCase() ?? "";
        const rankNumber = approvedUser[0].rank.replace("R", "");
        const customRole = alli + "_" + rankNumber;

        const allianceRole = interaction.guild?.roles.cache.find(
          (role) => role.name === `${alli}_ALLIANCE`,
        );

        if (allianceRole) {
          await member.roles.add(allianceRole);

          if (rankNumber === "5" || rankNumber === "4") {
            const customRoleDiscord = interaction.guild?.roles.cache.find(
              (role) => role.name === customRole,
            );

            if (customRoleDiscord) {
              await member.roles.add(customRoleDiscord);
            } else {
              console.warn(`[WARN] Custom role ${customRole} not found`);
            }
          }
        } else {
          console.warn("[WARN] Alliance role not found");
        }
      }

      const rankRole = interaction.guild?.roles.cache.find(
        (role) => role.name === approvedUser[0].rank,
      );
      if (rankRole) {
        await member.roles.add(rankRole);
      } else {
        console.warn("[WARN] Rank role not found");
      }

      await db
        .update(users)
        .set({
          status: "approved",
        })
        .where(eq(users.user_discord_id, userId));

      await interaction.editReply({
        content: `Registration approved for <@${userId}>.`,
        components: [],
      });

      const user = await client.users.fetch(userId).catch(() => null);
      if (user) {
        await user.send("Your registration has been approved.");
      } else {
        console.warn(`[WARN] Could not fetch user to send DM: ${userId}`);
      }
    } else {
      await interaction.editReply({
        content: "User not found.",
        components: [],
      });
    }
  } catch (error) {
    console.error("Error approving registration:", error);
    await interaction.editReply({
      content: "An error occurred while approving registration.",
      components: [],
    });
  }
}
