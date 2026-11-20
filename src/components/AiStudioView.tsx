import React, { useState } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  Copy,
  FilePenLine,
  MessageSquare,
  Send,
  Wand2,
} from "lucide-react";

type AiTab = "humanize" | "generator" | "assistant";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TONES = [
  "Natural Editorial",
  "Conversational",
  "Academic Clear",
  "Executive Concise",
] as const;

const INTENSITIES = ["Light Polish", "Balanced Humanize", "Deep Rewrite"] as const;

const GEN_FORMATS = [
  "Article / Essay",
  "Professional Email",
  "Document Summary",
  "Product Copy",
  "Technical Guide",
] as const;

const GEN_LENGTHS = [
  "Concise (~150 words)",
  "Standard (~350 words)",
  "Detailed (~700 words)",
] as const;

const GEN_STYLES = [
  "Clear Editorial",
  "Natural Human",
  "Executive Brief",
  "Friendly Direct",
] as const;

const SAMPLE_AI_TEXT =
  "In today's fast-paced digital landscape, leveraging cutting-edge document compression technologies is a testament to organizational efficiency. Furthermore, delving into streamlined workflows enables teams to unlock unprecedented synergy and elevate productivity to new heights.";

export default function AiStudioView() {
  const [activeTab, setActiveTab] = useState<AiTab>("humanize");

  // Reverter state
  const [inputText, setInputText] = useState<string>("");
  const [outputText, setOutputText] = useState<string>("");
  const [tone, setTone] = useState<string>("Natural Editorial");
  const [intensity, setIntensity] = useState<string>("Balanced Humanize");
  const [isHumanizing, setIsHumanizing] = useState<boolean>(false);
  const [humanizeError, setHumanizeError] = useState<string>("");
  const [copiedReverter, setCopiedReverter] = useState<boolean>(false);

  // Generator state
  const [genPrompt, setGenPrompt] = useState<string>("");
  const [genFormat, setGenFormat] = useState<string>("Article / Essay");
  const [genLength, setGenLength] = useState<string>("Standard (~350 words)");
  const [genStyle, setGenStyle] = useState<string>("Clear Editorial");
  const [genOutput, setGenOutput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [genError, setGenError] = useState<string>("");
  const [copiedGen, setCopiedGen] = useState<boolean>(false);

  // Assistant state
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hello, I am the pp Workspace Assistant for Laèb. Ask me about PDF and image compression settings, international passport photo dimensions, or writing clarity.",
    },
  ]);
  const [promptInput, setPromptInput] = useState<string>("");
  const [isSending, setIsSending] = useState<boolean>(false);
  const [chatError, setChatError] = useState<string>("");

  const wordCount = (txt: string) =>
    txt.trim() ? txt.trim().split(/\s+/).length : 0;

  const handleHumanize = async () => {
    if (!inputText.trim()) return;
    setIsHumanizing(true);
    setHumanizeError("");

    try {
      const response = await fetch("/api/ai/humanize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: inputText,
          tone,
          intensity,
        }),
      });
      const data = (await response.json()) as { output?: string; error?: string };
      if (!response.ok || !data.output) {
        throw new Error(data.error || "Unable to humanize text.");
      }
      setOutputText(data.output);
    } catch (err) {
      setHumanizeError(err instanceof Error ? err.message : "Humanization failed.");
    } finally {
      setIsHumanizing(false);
    }
  };

  const handleGenerate = async () => {
    if (!genPrompt.trim()) return;
    setIsGenerating(true);
    setGenError("");

    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: genPrompt,
          format: genFormat,
          length: genLength,
          style: genStyle,
        }),
      });
      const data = (await response.json()) as { output?: string; error?: string };
      if (!response.ok || !data.output) {
        throw new Error(data.error || "Unable to generate content.");
      }
      setGenOutput(data.output);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyReverter = async () => {
    if (!outputText) return;
    await navigator.clipboard.writeText(outputText);
    setCopiedReverter(true);
    setTimeout(() => setCopiedReverter(false), 1800);
  };

  const handleCopyGen = async () => {
    if (!genOutput) return;
    await navigator.clipboard.writeText(genOutput);
    setCopiedGen(true);
    setTimeout(() => setCopiedGen(false), 1800);
  };

  const handleSendToReverter = () => {
    if (!genOutput) return;
    setInputText(genOutput);
    setOutputText("");
    setActiveTab("humanize");
  };

  const handleSendChat = async (textOverride?: string) => {
    const text = (textOverride ?? promptInput).trim();
    if (!text || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setPromptInput("");
    setChatError("");
    setIsSending(true);

    try {
      const response = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || "Assistant failed to respond.");
      }
      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Failed to reach AI assistant.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between border-b border-slate-200 dark:border-slate-800/80 pb-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium text-cyan-600 dark:text-cyan-400 tracking-wide">
            Language &amp; Workflow Intelligence
          </p>
          <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 [text-wrap:balance]">
            AI Reverter, Generator &amp; Assistant
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            Revert stiff AI prose into natural human writing, generate fresh drafts from a brief,
            or consult the pp assistant for document compression and passport sizing guidance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-200/70 dark:bg-slate-900 self-start md:self-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("humanize")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "humanize"
                ? "bg-white dark:bg-[#141D2A] text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            AI Reverter
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("generator")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "generator"
                ? "bg-white dark:bg-[#141D2A] text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <FilePenLine className="w-3.5 h-3.5" />
            AI Generator
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("assistant")}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === "assistant"
                ? "bg-white dark:bg-[#141D2A] text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            AI Assistant
          </button>
        </div>
      </div>

      {activeTab === "humanize" ? (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Target Voice
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTone(t)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        tone === t
                          ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Rewrite Depth
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {INTENSITIES.map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setIntensity(lvl)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        intensity === lvl
                          ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                          : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setInputText(SAMPLE_AI_TEXT)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors whitespace-nowrap cursor-pointer"
              >
                Load Sample
              </button>
              <button
                type="button"
                disabled={isHumanizing || !inputText.trim()}
                onClick={handleHumanize}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-5 py-2 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {isHumanizing ? "Reverting..." : "Humanize Text"}
              </button>
            </div>
          </div>

          {humanizeError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:text-red-300">
              {humanizeError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Source Text
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  {wordCount(inputText)} words · {inputText.length} chars
                </span>
              </div>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={12}
                placeholder="Paste AI-generated or robotic prose here..."
                className="mt-3 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none"
              />
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                  Humanized Output
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                    {wordCount(outputText)} words · {outputText.length} chars
                  </span>
                  {outputText && (
                    <button
                      type="button"
                      onClick={handleCopyReverter}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:underline cursor-pointer"
                    >
                      {copiedReverter ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              <textarea
                value={outputText}
                readOnly
                rows={12}
                placeholder="Natural rewritten prose will appear here..."
                className="mt-3 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none"
              />
            </div>
          </div>
        </div>
      ) : activeTab === "generator" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Generator Brief & Options */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Prompt or Topic
              </label>
              <textarea
                value={genPrompt}
                onChange={(e) => setGenPrompt(e.target.value)}
                rows={5}
                placeholder="Describe what you want to write (e.g., an announcement email for a new passport photo tool, or a concise brief on PDF compression)..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C12] p-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                Format
              </label>
              <div className="flex flex-wrap gap-1.5">
                {GEN_FORMATS.map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setGenFormat(fmt)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      genFormat === fmt
                        ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
                        : "border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Length
                </label>
                <select
                  value={genLength}
                  onChange={(e) => setGenLength(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C12] px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {GEN_LENGTHS.map((len) => (
                    <option key={len} value={len}>
                      {len}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                  Writing Style
                </label>
                <select
                  value={genStyle}
                  onChange={(e) => setGenStyle(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C12] px-3 py-2 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  {GEN_STYLES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {genError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
                {genError}
              </div>
            )}

            <button
              type="button"
              disabled={isGenerating || !genPrompt.trim()}
              onClick={handleGenerate}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <FilePenLine className="w-4 h-4" />
              {isGenerating ? "Generating..." : "Generate Content"}
            </button>
          </div>

          {/* Generated Draft Panel */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] p-5 flex flex-col min-h-[420px]">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-sm font-semibold text-cyan-600 dark:text-cyan-400">
                  Generated Draft
                </span>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                  {wordCount(genOutput)} words · {genFormat}
                </p>
              </div>

              {genOutput && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopyGen}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-cyan-600 dark:hover:text-cyan-400 cursor-pointer"
                  >
                    {copiedGen ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendToReverter}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Send to Reverter
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            <textarea
              value={genOutput}
              onChange={(e) => setGenOutput(e.target.value)}
              rows={14}
              placeholder="Your generated draft will appear here. You can edit it directly or send it to the AI Reverter for humanization..."
              className="mt-3 w-full flex-1 resize-none bg-transparent text-sm leading-relaxed text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none"
            />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D131C] overflow-hidden flex flex-col h-[560px]">
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              pp Workspace Assistant
            </span>
            <div className="flex flex-wrap gap-2">
              {[
                "What are US vs Schengen passport photo requirements?",
                "Best image format for web compression?",
              ].map((quick) => (
                <button
                  key={quick}
                  type="button"
                  onClick={() => void handleSendChat(quick)}
                  className="text-xs px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-cyan-500/50 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors cursor-pointer"
                >
                  {quick}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-100 dark:bg-[#131B27] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="rounded-xl px-4 py-3 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-[#131B27] border border-slate-200 dark:border-slate-800">
                  Thinking...
                </div>
              </div>
            )}
          </div>

          {chatError && (
            <div className="mx-5 mb-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-xs text-red-700 dark:text-red-300">
              {chatError}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSendChat();
            }}
            className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-3"
          >
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ask about compression settings, passport rules, or document prep..."
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#080C12] px-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
            />
            <button
              type="submit"
              disabled={isSending || !promptInput.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Send
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
