import { describe, it, expect } from "vitest";
import { filterConversation, serializeForClaude } from "../src/lib/transcript.js";

describe("filterConversation", () => {
  it("extracts user messages with string content", () => {
    const lines = ['{"type": "user", "message": {"content": "Hello, world!"}}'];
    const result = filterConversation(lines);
    expect(result).toEqual([{ role: "user", text: "Hello, world!" }]);
  });

  it("extracts assistant messages with text blocks", () => {
    const lines = [
      '{"type": "assistant", "message": {"content": [{"type": "text", "text": "Hi there!"}]}}',
    ];
    const result = filterConversation(lines);
    expect(result).toEqual([{ role: "assistant", text: "Hi there!" }]);
  });

  it("concatenates multiple text blocks in assistant message", () => {
    const lines = [
      '{"type": "assistant", "message": {"content": [{"type": "text", "text": "First."}, {"type": "text", "text": "Second."}]}}',
    ];
    const result = filterConversation(lines);
    expect(result).toEqual([{ role: "assistant", text: "First.\nSecond." }]);
  });

  it("ignores tool_use blocks in assistant messages", () => {
    const lines = [
      '{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "read_file"}, {"type": "text", "text": "Done!"}]}}',
    ];
    const result = filterConversation(lines);
    expect(result).toEqual([{ role: "assistant", text: "Done!" }]);
  });

  it("ignores thinking blocks", () => {
    const lines = [
      '{"type": "assistant", "message": {"content": [{"type": "thinking", "text": "Hmm..."}, {"type": "text", "text": "Result"}]}}',
    ];
    const result = filterConversation(lines);
    expect(result).toEqual([{ role: "assistant", text: "Result" }]);
  });

  it("ignores user messages with non-string content (tool_result)", () => {
    const lines = [
      '{"type": "user", "message": {"content": [{"type": "tool_result", "content": "data"}]}}',
    ];
    const result = filterConversation(lines);
    expect(result).toEqual([]);
  });

  it("handles empty lines and invalid JSON", () => {
    const lines = ["", "invalid json", '{"type": "user", "message": {"content": "Valid"}}'];
    const result = filterConversation(lines);
    expect(result).toEqual([{ role: "user", text: "Valid" }]);
  });

  it("trims whitespace from messages", () => {
    const lines = ['{"type": "user", "message": {"content": "  trimmed  "}}'];
    const result = filterConversation(lines);
    expect(result).toEqual([{ role: "user", text: "trimmed" }]);
  });

  it("handles multiple messages in order", () => {
    const lines = [
      '{"type": "user", "message": {"content": "Question"}}',
      '{"type": "assistant", "message": {"content": [{"type": "text", "text": "Answer"}]}}',
      '{"type": "user", "message": {"content": "Follow-up"}}',
    ];
    const result = filterConversation(lines);
    expect(result).toEqual([
      { role: "user", text: "Question" },
      { role: "assistant", text: "Answer" },
      { role: "user", text: "Follow-up" },
    ]);
  });
});

describe("serializeForClaude", () => {
  it("formats messages for claude input", () => {
    const msgs = [
      { role: "user" as const, text: "Hello" },
      { role: "assistant" as const, text: "Hi!" },
    ];
    const result = serializeForClaude(msgs);
    expect(result).toContain("Conversation transcript (role: text):");
    expect(result).toContain("[user]\nHello");
    expect(result).toContain("[assistant]\nHi!");
  });

  it("handles empty message list", () => {
    const result = serializeForClaude([]);
    expect(result).toBe("Conversation transcript (role: text):\n");
  });
});
