import type { MoveOp, Plan, FileNode } from "./services.js";
import fetch from "node-fetch";

type LlmOutput = {
  moves?: MoveOp[];
};

export async function tryLlmOrganize(
  files: FileNode[],
  instructions: string
): Promise<Plan | null> {
  const llmBase = process.env.LLM_BASE_URL;
  if (llmBase) {
    try {
      const body = {
        instructions,
        files: files.slice(0, 500).map((f) => ({
          name: f.name,
          path: f.path,
          type: f.type,
          ext: f.ext,
          size: f.size,
          atimeDays: f.atimeMs
            ? Math.floor((Date.now() - f.atimeMs) / (1000 * 60 * 60 * 24))
            : undefined,
        })),
      };
      const res = await fetch(`${llmBase}/v1/organize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`LLM middleware error ${res.status}`);
      const data = (await res.json()) as {
        moves?: { from: string; to: string; reason: string }[];
      };
      return { moves: data.moves || [], deletions: [] };
    } catch (e) {
      console.warn(
        "LLM middleware call failed, falling back:",
        (e as any)?.message
      );
      // fall through to direct model or heuristic
    }
  }
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  try {
    const { ChatGoogleGenerativeAI } = await import("@langchain/google-genai");
    const { z } = await import("zod");

    const modelName = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
    const model = new ChatGoogleGenerativeAI({
      apiKey,
      model: modelName,
      temperature: 0.2,
    } as any);

    const schema = z.object({
      moves: z
        .array(
          z.object({
            from: z.string(),
            to: z.string(),
            reason: z.string(),
          })
        )
        .optional(),
    });

    const fileSummaries = files.slice(0, 500).map((f) => ({
      path: f.path,
      name: f.name,
      type: f.type,
      ext: f.ext,
      size: f.size,
      atimeDays: f.atimeMs
        ? Math.floor((Date.now() - f.atimeMs) / (1000 * 60 * 60 * 24))
        : undefined,
    }));

    const prompt = [
      "You are an expert file librarian. Organize files according to the user instructions.",
      "Return a JSON with a `moves` array containing objects: { from, to, reason }.",
      "Only move items within the /demo root. Keep file names same unless necessary.",
      `User instructions: ${instructions}`,
      `Files: ${JSON.stringify(fileSummaries)}`,
    ].join("\n");

    const res = await model.invoke([{ role: "user", content: prompt }] as any);
    const rawContent = (res as any).content;
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
        ? rawContent[0]?.text ?? JSON.stringify(rawContent)
        : String(rawContent ?? "");

    const json = extractJson(text);
    const parsed = json
      ? schema.safeParse(json)
      : ({ success: false } as const);
    const moves =
      parsed && (parsed as any).success ? (parsed as any).data.moves ?? [] : [];
    return { moves, deletions: [] };
  } catch (e) {
    console.warn(
      "LLM organize failed or not available, falling back. Error:",
      (e as any)?.message
    );
    return null;
  }
}

function extractJson(text: string): unknown | null {
  // Try direct JSON parse
  try {
    return JSON.parse(text);
  } catch {}
  // Try to extract from a ```json ... ``` block
  const codeBlock = text.match(/```json\s*([\s\S]*?)```/i);
  if (codeBlock && codeBlock[1]) {
    try {
      return JSON.parse(codeBlock[1]);
    } catch {}
  }
  // Try to locate first { ... } block
  const firstCurly = text.indexOf("{");
  const lastCurly = text.lastIndexOf("}");
  if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
    const slice = text.slice(firstCurly, lastCurly + 1);
    try {
      return JSON.parse(slice);
    } catch {}
  }
  return null;
}
