// src/services/ai.service.js
import OpenAI, { toFile } from 'openai';
import path from 'node:path';
import * as Diff from 'diff';                // robust for CJS
import { promises as fs } from 'node:fs';
import { storage } from '../config/firebase.js';
import { getPolicyPdfStream } from './policies.service.js';


/**
 * Summarize a health insurance policy PDF by ID.
 * Requires OPENAI_API_KEY in env.
 */
export const getPolicySummary = async (id) => {
  try {
    const res = await getPolicyPdfStream(id);
    if (!res.ok) return res;

    const { stream, filename, contentType, objectName } = res;

    // 1) Read the GCS stream into a Buffer
    const buffer = await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (d) => chunks.push(d));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 2) Upload the PDF and get a file_id
    const uploaded = await client.files.create({
      file: await toFile(buffer, filename || "policy.pdf", {
        type: contentType || "application/pdf",
      }),
      purpose: "assistants", // per docs for file inputs with Responses
    });

    // 3) Ask the model, attaching the PDF via input_file + file_id
    const prompt = [
      "You are an expert medical insurance policy analyst.",
      "Summarize the attached health insurance policy clearly and concisely. Include details about the medication coverage and prices. Do not create tables. Do not format text using bold, italics, asterisk etc. Only plain text.",
    ].join("\n");

    const response = await client.responses.create({
      model: "gpt-4o-mini", // vision-capable; supports PDF inputs
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_file", file_id: uploaded.id }, // <-- key change
          ],
        },
      ],
    });

    return response.output_text?.trim() || "";
  } catch (err) {
    return err?.message || String(err);
  }
};

export const getPolicyCoverageMap = async (id) => {
  try {
    const res = await getPolicyPdfStream(id);
    if (!res.ok) return res;

    const { stream, filename, contentType, objectName } = res;

    // 1) Read the GCS stream into a Buffer
    const buffer = await new Promise((resolve, reject) => {
      const chunks = [];
      stream.on("data", (d) => chunks.push(d));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // 2) Upload the PDF and get a file_id
    const uploaded = await client.files.create({
      file: await toFile(buffer, filename || "policy.pdf", {
        type: contentType || "application/pdf",
      }),
      purpose: "assistants", // per docs for file inputs with Responses
    });

    // 3) Ask the model, attaching the PDF via input_file + file_id
    const prompt = [
      "You are an expert medical insurance policy analyst.",
      "Obtain all medicines from the policy and create a JSON string. Only reply with the JSON and nothing else. The JSON must look like this (example): [{'nurofen 200mg': 100}]. Array of objects with keys the names of the medicines. The values are the percentages the medicines are covered. If a medicine is covered, the value will be 100. Otherwise, specify the percentage. Do not format it, make it in one line. Do not add \n, just reply with plain JSON. Very important to be plain JSON. Make sure the JSON is an array of medicine objects and that the format is correct."
    ].join("\n");

    const response = await client.responses.create({
      model: "gpt-4o-mini", // vision-capable; supports PDF inputs
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_file", file_id: uploaded.id }, // <-- key change
          ],
        },
      ],
    });

    return response.output_text?.trim() || "";
  } catch (err) {
    return err?.message || String(err);
  }
};
