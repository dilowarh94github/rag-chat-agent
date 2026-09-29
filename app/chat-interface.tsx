"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Source = { id: number; source: string; page: number; similarity: number };
type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

const suggestions = [
  "What are the main topics in this document?",
  "Summarize the most important recommendations.",
  "What does the document say about implementation?",
];

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isLoading]);

  async function askQuestion(value: string) {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;

    setQuestion("");
    setError("");
    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const result = (await response.json()) as {
        answer?: string;
        sources?: Source[];
        error?: string;
      };

      if (!response.ok) throw new Error(result.error || "The request failed.");
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.answer || "I couldn't create an answer for that question.",
          sources: result.sources || [],
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askQuestion(question);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void askQuestion(question);
    }
  }

  return (
    <main className="chat-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Groundwork home">
          <span className="brand-mark"><BrandIcon /></span>
          <span>groundwork<span className="brand-period">.</span></span>
        </Link>
        <div className="sidebar-rule" />
        <div className="library-label">YOUR WORKSPACE</div>
        <div className="library-card">
          <div className="file-icon"><FileIcon /></div>
          <div className="library-copy">
            <strong>Knowledge base</strong>
            <span>Indexed and ready</span>
          </div>
          <span className="status-dot" aria-label="Ready" />
        </div>
        <div className="sidebar-bottom">
          <div className="secure-badge"><LockIcon /> Private by design</div>
          <p>Your questions are answered from your connected documents.</p>
        </div>
      </aside>

      <section className="conversation-panel">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><BrandIcon /></span> groundwork<span className="brand-period">.</span></div>
          <div className="topbar-context"><span className="context-pulse" /> Document assistant</div>
          <div className="model-label"><span className="model-spark">✳</span> Groq · RAG</div>
        </header>

        <div className="conversation-scroll">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-orbit"><BrandIcon /></div>
              <div className="eyebrow"><span /> YOUR DOCUMENT, IN CONTEXT</div>
              <h1>Good questions<br />start <em>somewhere.</em></h1>
              <p className="welcome-copy">Ask anything about your knowledge base. I’ll find the relevant passages and explain what they say.</p>
              <div className="suggestion-heading">A FEW PLACES TO START</div>
              <div className="suggestions">
                {suggestions.map((item, index) => (
                  <button className="suggestion" key={item} onClick={() => void askQuestion(item)} disabled={isLoading}>
                    <span className="suggestion-number">0{index + 1}</span>
                    <span>{item}</span>
                    <span className="suggestion-arrow">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list" aria-live="polite">
              {messages.map((message, index) => (
                <article className={`message-row ${message.role}`} key={`${message.role}-${index}`}>
                  <div className={`avatar ${message.role === "assistant" ? "assistant-avatar" : "user-avatar"}`}>
                    {message.role === "assistant" ? <BrandIcon /> : "Y"}
                  </div>
                  <div className="message-body">
                    <div className="message-author">{message.role === "assistant" ? "GROUNDWORK" : "YOU"}</div>
                    <p className="message-text">{message.content}</p>
                    {message.sources && message.sources.length > 0 && (
                      <div className="sources-block">
                        <div className="sources-title">SOURCES IN YOUR DOCUMENT</div>
                        <div className="source-list">
                          {message.sources.map((source) => (
                            <span className="source-chip" key={`${source.id}-${source.source}-${source.page}`}>
                              <FileIcon /> [{source.id}] {source.source} · p. {source.page}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </article>
              ))}
              {isLoading && (
                <div className="message-row assistant" aria-label="Searching your document">
                  <div className="avatar assistant-avatar"><BrandIcon /></div>
                  <div className="message-body">
                    <div className="message-author">GROUNDWORK</div>
                    <div className="thinking"><span /><span /><span /> <small>Finding the right passages</small></div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="composer-wrap">
          {error && <div className="error-message" role="alert">{error}</div>}
          <form className="composer" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask your document a question…"
              aria-label="Your question"
              rows={1}
              maxLength={2000}
              disabled={isLoading}
            />
            <button className="send-button" type="submit" disabled={!question.trim() || isLoading} aria-label="Send question">
              <SendIcon />
            </button>
          </form>
          <div className="composer-hint"><span>Enter to send</span><span>·</span><span>Shift + Enter for a new line</span><span className="hint-right">Answers grounded in your sources</span></div>
        </div>
      </section>
    </main>
  );
}

function BrandIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 18.5 12 5l7 13.5M8 13.5h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><circle cx="12" cy="18.5" r="1.25" fill="currentColor"/></svg>;
}

function FileIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5.75 2.75h5.1l3.4 3.4v10.1H5.75V2.75Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M10.75 2.9v3.6h3.3M8 10h4M8 12.7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5.25 7V4.75a2.75 2.75 0 0 1 5.5 0V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m3.25 9.25 13-6-4.5 13-2.5-5-6-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="m9.25 11.25 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}
