"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  knowledgeEntries,
  personas,
  quickQuestions,
  type KnowledgeEntry,
  type PersonaId,
} from "./knowledge";

type ViewId = "desk" | "knowledge" | "assistant";
type ChatMessage = { role: "user" | "assistant"; content: string };

const navItems: Array<{ id: ViewId; label: string; sub: string }> = [
  { id: "desk", label: "咨询工作台", sub: "按来电对象响应" },
  { id: "knowledge", label: "知识库", sub: "集中检索全部口径" },
  { id: "assistant", label: "小科助手", sub: "正式对话辅助" },
];

function SearchIcon() {
  return <span aria-hidden="true">⌕</span>;
}

function ArrowIcon() {
  return <span aria-hidden="true">→</span>;
}

function todayLabel() {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());
}

function EntryCard({
  entry,
  onOpen,
}: {
  entry: KnowledgeEntry;
  onOpen: (entry: KnowledgeEntry) => void;
}) {
  return (
    <button className="entry-card" onClick={() => onOpen(entry)}>
      <div className="entry-card-top">
        <span className="entry-category">{entry.category}</span>
        {entry.hot && <span className="hot-pill">高频</span>}
      </div>
      <h3>{entry.title}</h3>
      <p>{entry.summary}</p>
      <div className="entry-card-footer">
        <span>更新于 {entry.updated}</span>
        <span className="read-more">
          查看回复口径 <ArrowIcon />
        </span>
      </div>
    </button>
  );
}

function DetailPanel({
  entry,
  onClose,
}: {
  entry: KnowledgeEntry | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [entry]);

  if (!entry) return null;

  const copyScript = async () => {
    await navigator.clipboard.writeText(entry.script);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="panel-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="detail-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-head">
          <div>
            <span className="eyebrow">{entry.category}</span>
            <h2 id="detail-title">{entry.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭详情">
            ×
          </button>
        </div>

        <section className="script-box">
          <div className="section-label-row">
            <span className="section-kicker">建议回复话术</span>
            <button className="copy-button" onClick={copyScript}>
              {copied ? "已复制" : "复制话术"}
            </button>
          </div>
          <p>“{entry.script}”</p>
        </section>

        <div className="detail-grid">
          <section>
            <h4>来电核验要点</h4>
            <ol className="check-list">
              {entry.verify.map((item, index) => (
                <li key={item}>
                  <span>{index + 1}</span>
                  {item}
                </li>
              ))}
            </ol>
          </section>
          <section>
            <h4>建议办理路径</h4>
            <div className="path-list">
              {entry.path.map((item, index) => (
                <div key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>{item}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="boundary-box">
          <span>转人工 / 风险边界</span>
          <p>{entry.boundary}</p>
        </section>

        <a
          className="source-link"
          href={entry.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span>
            <small>政策与工作依据</small>
            {entry.sourceTitle}
          </span>
          <ArrowIcon />
        </a>
      </aside>
    </div>
  );
}

function AssistantView({
  contextPersona,
}: {
  contextPersona: PersonaId;
}) {
  const activePersona = personas.find((item) => item.id === contextPersona)!;
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "您好，我是小科助手。您可以把来电人的身份和具体问题告诉我，我会依据已整理的业务口径，帮您生成一段正式、可直接用于电话沟通的回复。",
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const ask = async (preset?: string) => {
    const question = (preset ?? input).trim();
    if (!question || loading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: question },
    ];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 50000);
      const response = await fetch("/xk-assistant/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: activePersona.label,
          messages: nextMessages.slice(-10),
        }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const contentType = response.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? ((await response.json()) as { reply?: string; error?: string })
        : { error: "助手服务入口暂时不可用，请刷新页面后重试。" };
      if (!response.ok || !data.reply) {
        throw new Error(data.error || "小科助手暂时无法响应");
      }
      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply! },
      ]);
    } catch (reason) {
      setError(
        reason instanceof DOMException && reason.name === "AbortError"
          ? "小科助手响应时间较长，请稍后重试或先使用知识库口径。"
          : reason instanceof Error
            ? reason.message
            : "服务暂时不可用，请先使用左侧知识库口径。",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="assistant-layout">
      <section className="chat-card">
        <div className="chat-head">
          <div className="assistant-avatar">科</div>
          <div>
            <div className="online-row">
              <h2>小科助手</h2>
              <span>在线</span>
            </div>
            <p>GLM-5.2 · 四川科技信息咨询场景</p>
          </div>
          <div className="context-chip">当前：{activePersona.short}</div>
        </div>

        <div className="messages" aria-live="polite">
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`message ${message.role}`}
            >
              {message.role === "assistant" && (
                <span className="message-avatar">科</span>
              )}
              <div>
                <small>{message.role === "assistant" ? "小科助手" : "您"}</small>
                <p>{message.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="message assistant">
              <span className="message-avatar">科</span>
              <div>
                <small>小科助手</small>
                <div className="typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            </div>
          )}
          {error && <div className="chat-error">{error}</div>}
          <div ref={endRef} />
        </div>

        <div className="suggestions">
          {quickQuestions.map((question) => (
            <button key={question} onClick={() => ask(question)}>
              {question}
            </button>
          ))}
        </div>

        <form
          className="chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：某银行来电，想核验一家企业是否属于科技型中小企业，我该怎么回复？"
            rows={2}
            maxLength={2000}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask();
              }
            }}
          />
          <button disabled={loading || !input.trim()} aria-label="发送问题">
            <ArrowIcon />
          </button>
        </form>
        <p className="assistant-note">
          小科助手用于辅助拟稿；政策时效、个案审核和非公开数据请以人工核验为准。
        </p>
      </section>

      <aside className="assistant-guide">
        <span className="eyebrow">提问小贴士</span>
        <h3>给出 3 个信息，回复会更准</h3>
        <div className="guide-steps">
          <div>
            <span>01</span>
            <p>
              <strong>来电主体</strong>
              银行、企业还是上下级单位
            </p>
          </div>
          <div>
            <span>02</span>
            <p>
              <strong>具体事项</strong>
              哪项政策、项目或系统环节
            </p>
          </div>
          <div>
            <span>03</span>
            <p>
              <strong>希望结果</strong>
              查口径、列材料还是拟回复
            </p>
          </div>
        </div>
        <div className="guardrail">
          <strong>小科助手不会</strong>
          <ul>
            <li>代替主管部门作出审批结论</li>
            <li>披露未经授权的企业数据</li>
            <li>接收或处理涉密项目内容</li>
            <li>编造联系人、期限和政策条款</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export default function ConsultationDesk() {
  const [view, setView] = useState<ViewId>("desk");
  const [persona, setPersona] = useState<PersonaId>("bank");
  const [kbPersona, setKbPersona] = useState<PersonaId | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<KnowledgeEntry | null>(
    null,
  );
  const [today, setToday] = useState("");

  useEffect(() => {
    setToday(todayLabel());
  }, []);

  useEffect(() => {
    if (!selectedEntry) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedEntry(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedEntry]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleEntries = useMemo(() => {
    const source =
      view === "knowledge"
        ? kbPersona === "all"
          ? knowledgeEntries
          : knowledgeEntries.filter((item) => item.persona === kbPersona)
        : knowledgeEntries.filter((item) => item.persona === persona);
    if (!normalizedQuery) return source;
    return source.filter((item) =>
      [
        item.title,
        item.summary,
        item.category,
        item.script,
        ...item.keywords,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [kbPersona, normalizedQuery, persona, view]);

  const activePersona = personas.find((item) => item.id === persona)!;

  const startGlobalSearch = () => {
    setView("knowledge");
    setKbPersona("all");
    window.setTimeout(() => {
      document.getElementById("knowledge-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  };

  return (
    <div className="site-shell">
      <header className="topbar">
        <div className="header-inner">
          <button className="brand" onClick={() => setView("desk")}>
            <span className="brand-mark">
              <i />
              <b>科</b>
            </span>
            <span>
              <strong>四川省科学技术信息研究所</strong>
              <small>科技信息咨询响应平台</small>
            </span>
          </button>

          <nav aria-label="主导航">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                  onClick={() => {
                    setView(item.id);
                    setQuery("");
                    setKbPersona("all");
                }}
              >
                <span>{item.label}</span>
                <small>{item.sub}</small>
              </button>
            ))}
          </nav>

          <div className="header-meta">
            <span className="status-dot" />
            <span>
              <small>知识口径</small>
              已更新
            </span>
          </div>
        </div>
      </header>

      <main>
        {view !== "assistant" && (
          <section className="hero">
            <div className="hero-grid" aria-hidden="true" />
            <div className="hero-inner">
              <div className="hero-copy">
                <span className="hero-kicker">
                  <i />
                  新入职同事 · 电话咨询辅助
                </span>
                <h1>
                  {view === "desk" ? (
                    <>
                      来电不慌，<em>一查即答</em>
                    </>
                  ) : (
                    <>
                      一个知识库，<em>统一回复口径</em>
                    </>
                  )}
                </h1>
                <p>
                  {view === "desk"
                    ? "先选择来电主体，再获取可直接照读的话术、核验要点和办理路径。"
                    : `当前收录 ${knowledgeEntries.length} 条高频咨询口径，覆盖信息所核心业务与协同场景。`}
                </p>
              </div>
              <div className="date-card">
                <small>今日值守</small>
                <strong>{today || "正在读取日期"}</strong>
                <span>政策依据更新至 2026.07</span>
              </div>
            </div>
          </section>
        )}

        <div className={view === "assistant" ? "content assistant-content" : "content"}>
          {view !== "assistant" && (
            <div className="search-wrap">
              <div className="global-search">
                <SearchIcon />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") startGlobalSearch();
                  }}
                  placeholder="输入关键词，如“创新券”“科技报告”“天府科创贷”"
                  aria-label="检索咨询知识"
                />
                {query && (
                  <button className="clear-search" onClick={() => setQuery("")}>
                    清空
                  </button>
                )}
                <button className="search-action" onClick={startGlobalSearch}>
                  全库检索
                </button>
              </div>
              <div className="quick-keywords">
                <span>快捷检索</span>
                {["创新券", "科技报告", "项目验收", "科创贷"].map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setQuery(item);
                      setView("knowledge");
                      setKbPersona("all");
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "desk" && (
            <>
              <section className="persona-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">STEP 01 · 识别来电</span>
                    <h2>这通电话来自谁？</h2>
                  </div>
                  <p>不同主体关注点不同，选择后自动切换建议口径</p>
                </div>
                <div className="persona-grid">
                  {personas.map((item, index) => (
                    <button
                      key={item.id}
                      data-persona={item.id}
                      className={`persona-card ${
                        persona === item.id ? "active" : ""
                      }`}
                      onClick={() => {
                        setPersona(item.id);
                        setQuery("");
                      }}
                    >
                      <span className="persona-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="persona-symbol">
                        {item.short.slice(0, 1)}
                      </span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                      <i>
                        选择 <ArrowIcon />
                      </i>
                    </button>
                  ))}
                </div>
              </section>

              <section className="response-section">
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">STEP 02 · 快速响应</span>
                    <h2>{activePersona.label}高频咨询</h2>
                  </div>
                  <button className="ask-assistant" onClick={() => setView("assistant")}>
                    问小科助手 <ArrowIcon />
                  </button>
                </div>
                <div className="workspace-grid">
                  <div className="entries-grid">
                    {visibleEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onOpen={setSelectedEntry}
                      />
                    ))}
                  </div>
                  <aside className="call-guide">
                    <span className="eyebrow">首通电话四步法</span>
                    <h3>先稳住，再分流</h3>
                    <div className="call-steps">
                      {[
                        ["确认身份", "单位、姓名、回拨方式"],
                        ["复述问题", "确认具体事项与期望"],
                        ["核验边界", "公开信息还是受限数据"],
                        ["给出下一步", "答复、登记或转业务人员"],
                      ].map(([title, desc], index) => (
                        <div key={title}>
                          <span>{index + 1}</span>
                          <p>
                            <strong>{title}</strong>
                            {desc}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="call-warning">
                      <strong>三不原则</strong>
                      <p>不承诺审批结果 · 不披露非公开数据 · 不接收涉密内容</p>
                    </div>
                  </aside>
                </div>
              </section>
            </>
          )}

          {view === "knowledge" && (
            <section className="knowledge-section" id="knowledge-results">
              <div className="knowledge-head">
                <div>
                  <span className="eyebrow">业务知识库</span>
                  <h2>
                    {query
                      ? `“${query}”的检索结果`
                      : "全部咨询回复口径"}
                  </h2>
                </div>
                <span className="result-count">{visibleEntries.length} 条结果</span>
              </div>
              <div className="filter-row">
                <button
                  className={kbPersona === "all" ? "soft-active" : ""}
                  onClick={() => {
                    setQuery("");
                    setKbPersona("all");
                  }}
                >
                  全部业务
                </button>
                {personas.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setKbPersona(item.id);
                    }}
                    className={kbPersona === item.id ? "soft-active" : ""}
                  >
                    {item.short}
                  </button>
                ))}
              </div>
              {visibleEntries.length ? (
                <div className="knowledge-list">
                  {visibleEntries.map((entry) => {
                    const entryPersona = personas.find(
                      (item) => item.id === entry.persona,
                    )!;
                    return (
                      <button
                        key={entry.id}
                        className="knowledge-row"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <span className={`row-persona ${entry.persona}`}>
                          {entryPersona.short.slice(0, 1)}
                        </span>
                        <span className="row-copy">
                          <span>
                            <i>{entryPersona.short}</i>
                            <i>{entry.category}</i>
                            {entry.hot && <b>高频</b>}
                          </span>
                          <strong>{entry.title}</strong>
                          <small>{entry.summary}</small>
                        </span>
                        <span className="row-date">{entry.updated}</span>
                        <ArrowIcon />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state">
                  <span>?</span>
                  <h3>暂未找到完全匹配的口径</h3>
                  <p>换一个关键词，或让小科助手帮您梳理问题。</p>
                  <button onClick={() => setView("assistant")}>问小科助手</button>
                </div>
              )}
            </section>
          )}

          {view === "assistant" && <AssistantView contextPersona={persona} />}
        </div>
      </main>

      <footer>
        <div>
          <span className="footer-brand">川科讯 · 咨询响应平台</span>
          <p>内部示意 Demo，不作为政策文件、行政决定或审批依据。</p>
        </div>
        <div>
          <a href="https://kjt.sc.gov.cn/" target="_blank" rel="noreferrer">
            四川省科学技术厅
          </a>
          <a href="https://www.scsttc.com/" target="_blank" rel="noreferrer">
            四川省技术转移中心
          </a>
        </div>
      </footer>

      <DetailPanel
        entry={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </div>
  );
}
