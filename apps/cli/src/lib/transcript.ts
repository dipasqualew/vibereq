import type { ConvMsg } from "../types.js";

interface TranscriptMessage {
  type?: string;
  message?: {
    content?: unknown;
  };
}

function extractAssistantText(content: unknown): string | null {
  if (!Array.isArray(content)) return null;

  const texts: string[] = [];
  for (const item of content) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;
    if (obj.type !== "text") continue;
    const text = obj.text;
    if (typeof text === "string" && text.trim()) {
      texts.push(text);
    }
  }

  const joined = texts.join("\n").trim();
  return joined || null;
}

export function filterConversation(lines: string[]): ConvMsg[] {
  const msgs: ConvMsg[] = [];

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;

    let obj: TranscriptMessage;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const typ = obj.type;
    if (typeof typ !== "string") continue;

    const message = obj.message;
    if (typeof message !== "object" || message === null) continue;

    const content = message.content;

    if (typ === "user") {
      if (typeof content === "string" && content.trim()) {
        msgs.push({ role: "user", text: content.trim() });
      }
      continue;
    }

    if (typ === "assistant") {
      const text = extractAssistantText(content);
      if (text) {
        msgs.push({ role: "assistant", text });
      }
      continue;
    }
  }

  return msgs;
}

export function serializeForClaude(msgs: ConvMsg[]): string {
  const lines: string[] = ["Conversation transcript (role: text):\n"];
  for (const msg of msgs) {
    lines.push(`[${msg.role}]\n${msg.text.trim()}\n`);
  }
  return lines.join("\n").trim() + "\n";
}
