import express from "express";
import { Resend } from "resend";
import type { Auth0IDToken } from "../app.ts";
import type { UserDocument } from "@rw/db/schemas/user.ts";

const router = express.Router();

const PLANT_OFFER_RECIPIENT = process.env.PLANT_OFFER_RECIPIENT;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
let resend: Resend | undefined;

const getResendClient = () => {
  if (!RESEND_API_KEY || !PLANT_OFFER_RECIPIENT) {
    return;
  }

  resend ??= new Resend(RESEND_API_KEY);
  return resend;
};

interface SpeciesBreakdownEntry {
  id: string;
  name: string;
  latinName?: string;
  count: number;
}

interface PlantOfferRequestBody {
  configId?: string;
  totalTrees?: number;
  species?: SpeciesBreakdownEntry[];
  senderEmail?: string;
  notes?: string;
  country?: string;
}

router.post(
  "/plant-offer-requests",
  async (
    req: express.Request & { user?: UserDocument; idToken?: Auth0IDToken },
    res: express.Response,
  ) => {
    const { configId, totalTrees, species, senderEmail, notes, country } =
      (req.body as PlantOfferRequestBody) ?? {};

    const resolvedSenderEmail = senderEmail ?? req.user?.email ?? req.idToken?.email;
    const userCountry = country ?? req.user?.countryCode ?? "Unknown";

    if (!resolvedSenderEmail) {
      return res.status(400).json({ message: "An email address is required to send the request." });
    }

    const resendClient = getResendClient();
    if (!resendClient || !PLANT_OFFER_RECIPIENT) {
      return res.status(503).json({ message: "Plant offer email is not configured." });
    }

    const total = Number(totalTrees);
    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({ message: "Total trees must be a positive number." });
    }

    const breakdown = Array.isArray(species)
      ? species
          .filter((entry) => entry && typeof entry.count === "number" && entry.count > 0)
          .map((entry) => ({
            id: String(entry.id ?? ""),
            name: entry.name ?? "Unknown species",
            latinName: entry.latinName,
            count: entry.count,
          }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

    try {
      const subjectParts = ["Plant Offer Request"];

      // Add DEVELOPMENT indicator if in dev mode
      const stripeMode = process.env.STRIPE_MODE as "DEV" | "PROD" | undefined;
      if (stripeMode === "DEV") {
        subjectParts.push("DEVELOPMENT");
      }

      // Build email body
      const emailLines = [
        "<h2>Request for an offer on trees</h2>",
        "",
        "<h3>Contact Information</h3>",
        `<p><strong>Client Email:</strong> ${resolvedSenderEmail}</p>`,
        `<p><strong>Country:</strong> ${userCountry}</p>`,
        "",
        "<h3>Order Details</h3>",
        `<p><strong>Total Trees:</strong> ${total.toLocaleString()}</p>`,
      ];

      if (breakdown.length > 0) {
        emailLines.push("", "<h3>Species Breakdown</h3>", "<ul>");
        breakdown.forEach((entry) => {
          const nameWithLatin = entry.latinName
            ? `${entry.name} (<em>${entry.latinName}</em>)`
            : entry.name;
          emailLines.push(
            `<li><strong>${nameWithLatin}:</strong> ${entry.count.toLocaleString()} trees</li>`,
          );
        });
        emailLines.push("</ul>");
      }

      if (notes && notes.trim()) {
        emailLines.push("", "<h3>Additional Notes</h3>", `<p>${notes.replace(/\n/g, "<br>")}</p>`);
      }

      if (configId) {
        emailLines.push("", "<hr>", `<p><small>Configuration ID: ${configId}</small></p>`);
      }

      const htmlBody = emailLines.join("\n");

      // Send email to nursery team using Resend
      await resendClient.emails.send({
        from: "RegenWorks <mail@noreply.regenfarmer.com>",
        to: [PLANT_OFFER_RECIPIENT],
        replyTo: resolvedSenderEmail,
        subject: subjectParts.join(" - "),
        html: htmlBody,
      });

      // Send confirmation receipt to user
      const receiptLines = [
        "<h2>Thank you for your request for trees</h2>",
        "",
        "<p>We've received your request and our nursery team will review it shortly. We'll get back to you as soon as possible.</p>",
        "",
        "<h3>Your Request Details</h3>",
        `<p><strong>Total Trees:</strong> ${total.toLocaleString()}</p>`,
      ];

      if (breakdown.length > 0) {
        receiptLines.push("", "<h3>Species Breakdown</h3>", "<ul>");
        breakdown.forEach((entry) => {
          const nameWithLatin = entry.latinName
            ? `${entry.name} (<em>${entry.latinName}</em>)`
            : entry.name;
          receiptLines.push(
            `<li><strong>${nameWithLatin}:</strong> ${entry.count.toLocaleString()} trees</li>`,
          );
        });
        receiptLines.push("</ul>");
      }

      if (notes && notes.trim()) {
        receiptLines.push("", "<h3>Your Notes</h3>", `<p>${notes.replace(/\n/g, "<br>")}</p>`);
      }

      receiptLines.push(
        "",
        "<hr>",
        "<p><small>This is an automated confirmation. Please do not reply to this email.</small></p>",
      );

      const receiptHtml = receiptLines.join("\n");

      await resendClient.emails.send({
        from: "RegenWorks <mail@noreply.regenfarmer.com>",
        to: [resolvedSenderEmail],
        subject: "Plant Offer Request Received - RegenWorks",
        html: receiptHtml,
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Failed to send plant offer request email", error);
      const message =
        error instanceof Error ? error.message : "Unexpected error while sending the email.";
      return res.status(500).json({ message });
    }
  },
);

export default router;
