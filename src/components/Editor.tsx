import React, { useState, useEffect, useRef, useMemo } from "react";
import { Edit3, ChevronDown, ArrowUp, ArrowDown, X } from "lucide-react";
import { translations } from "../utils/translations";

interface EditorProps {
  markdown: string;
  onChange: (md: string) => void;
  lang:
  | "en"
  | "zh"
  | "zh-tw"
  | "fr"
  | "de"
  | "it"
  | "es"
  | "pt"
  | "ja"
  | "ko"
  | "ru"
  | "uk";
}

export const Editor: React.FC<EditorProps> = ({ markdown, onChange, lang }) => {
  const t = translations[lang];

  // Editor references
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  // Find & Replace panel state
  const [showReplacePanel, setShowReplacePanel] = useState(false);
  const [showReplaceRow, setShowReplaceRow] = useState(true);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Simple stats
  const charCount = markdown.length;
  const wordCount = markdown.trim() === "" ? 0 : markdown.trim().split(/\s+/).length;

  // Matching logic
  const matches = useMemo(() => {
    if (!findQuery) return [];

    if (useRegex) {
      try {
        let pattern = findQuery;
        if (matchWholeWord) {
          pattern = `\\b${pattern}\\b`;
        }
        const flags = matchCase ? "g" : "gi";
        const regex = new RegExp(pattern, flags);
        const results: { start: number; end: number }[] = [];
        let match;

        while ((match = regex.exec(markdown)) !== null) {
          if (match.index === regex.lastIndex) {
            regex.lastIndex++; // Avoid infinite loop on zero-width matches
          }
          results.push({
            start: match.index,
            end: match.index + match[0].length,
          });
        }
        return results;
      } catch (e) {
        return []; // Return empty on invalid regex
      }
    } else {
      const results: { start: number; end: number }[] = [];
      let searchStr = findQuery;
      let docText = markdown;

      if (!matchCase) {
        searchStr = searchStr.toLowerCase();
        docText = docText.toLowerCase();
      }

      let pos = docText.indexOf(searchStr);
      while (pos !== -1) {
        let isMatch = true;
        if (matchWholeWord) {
          const beforeChar = pos > 0 ? markdown[pos - 1] : "";
          const afterChar = pos + findQuery.length < markdown.length ? markdown[pos + findQuery.length] : "";
          const isWordChar = (char: string) => /\w/.test(char);

          if (isWordChar(beforeChar) || isWordChar(afterChar)) {
            isMatch = false;
          }
        }

        if (isMatch) {
          results.push({
            start: pos,
            end: pos + findQuery.length,
          });
        }
        pos = docText.indexOf(searchStr, pos + 1);
      }
      return results;
    }
  }, [markdown, findQuery, matchCase, matchWholeWord, useRegex]);

  // Adjust match index if matches count shrinks
  useEffect(() => {
    if (matches.length === 0) {
      setCurrentMatchIndex(0);
    } else if (currentMatchIndex >= matches.length) {
      setCurrentMatchIndex(matches.length - 1);
    }
  }, [matches.length, currentMatchIndex]);

  // Handle Ctrl+F and Ctrl+H global keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && e.key.toLowerCase() === "h") {
        e.preventDefault();
        setShowReplacePanel(true);
        setShowReplaceRow(true);
        setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 50);
      } else if (isCtrlOrCmd && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowReplacePanel(true);
        setTimeout(() => {
          findInputRef.current?.focus();
          findInputRef.current?.select();
        }, 50);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showReplacePanel]);

  // Synchronize selection/highlight and jump/scroll to matched word as user types
  useEffect(() => {
    if (showReplacePanel && matches.length > 0) {
      // If the user is currently focusing/editing the textarea, do not disrupt their focus/selection/scrolling
      if (document.activeElement === textareaRef.current) {
        return;
      }

      const match = matches[currentMatchIndex];
      if (match && textareaRef.current) {
        const textarea = textareaRef.current;

        // 1. Update selection range
        textarea.setSelectionRange(match.start, match.end);

        // 2. Scroll the matched line into the center of the textarea
        // Try to scroll precisely using the highlight overlay element (works with wrapped lines)
        const currentHighlight = overlayRef.current?.querySelector(".search-highlight-current") as HTMLElement;
        if (currentHighlight) {
          const offsetTop = currentHighlight.offsetTop;
          textarea.scrollTop = offsetTop - (textarea.clientHeight / 2) + (currentHighlight.clientHeight / 2);
        } else {
          // Fallback to line-based calculation
          const textBefore = markdown.slice(0, match.start);
          const lineIndex = textBefore.split("\n").length - 1;

          const computedStyle = window.getComputedStyle(textarea);
          const fontSize = parseFloat(computedStyle.fontSize) || 13;
          const lineHeightVal = computedStyle.lineHeight;
          let lineHeight = fontSize * 1.6; // default fallback
          if (lineHeightVal && lineHeightVal !== "normal") {
            lineHeight = parseFloat(lineHeightVal);
          }

          const targetScrollTop = lineIndex * lineHeight;
          textarea.scrollTop = targetScrollTop - (textarea.clientHeight / 2) + (lineHeight / 2);
        }
      }
    }
  }, [currentMatchIndex, matches, showReplacePanel, markdown]);

  // Navigate matches without stealing focus
  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIndex = (currentMatchIndex + 1) % matches.length;
    setCurrentMatchIndex(nextIndex);
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    setCurrentMatchIndex(prevIndex);
  };

  // Replace Single (Undo/Redo friendly) and restores focus instantly
  const handleReplace = () => {
    if (matches.length === 0) return;
    const match = matches[currentMatchIndex];
    if (!match || !textareaRef.current) return;

    let replacement = replaceQuery;
    if (useRegex) {
      try {
        const pattern = matchWholeWord ? `\\b${findQuery}\\b` : findQuery;
        const flags = matchCase ? "" : "i";
        const regex = new RegExp(pattern, flags);
        const matchedText = markdown.slice(match.start, match.end);
        replacement = matchedText.replace(regex, replaceQuery);
      } catch (e) {
        // Fallback
      }
    }

    const textarea = textareaRef.current;
    const activeEl = document.activeElement as HTMLElement;

    // Temporarily focus to execute the text insertion command
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);

    try {
      document.execCommand("insertText", false, replacement);
    } catch (err) {
      const nextMarkdown = markdown.slice(0, match.start) + replacement + markdown.slice(match.end);
      onChange(nextMarkdown);
    }

    // Restore focus instantly to keep cursor context inside inputs
    if (activeEl) {
      activeEl.focus();
    }
  };

  // Replace All (Undo/Redo friendly via single select-all transaction)
  const handleReplaceAll = () => {
    if (matches.length === 0 || !textareaRef.current) return;
    const textarea = textareaRef.current;

    // Calculate full replaced content
    let nextMarkdown = markdown;
    if (useRegex) {
      try {
        const pattern = matchWholeWord ? `\\b${findQuery}\\b` : findQuery;
        const flags = matchCase ? "g" : "gi";
        const regex = new RegExp(pattern, flags);
        nextMarkdown = markdown.replace(regex, replaceQuery);
      } catch (e) {
        nextMarkdown = replaceAllLiterals();
      }
    } else {
      nextMarkdown = replaceAllLiterals();
    }

    textarea.focus();
    // Select the entire content range to replace it in one single history operation
    textarea.setSelectionRange(0, markdown.length);

    try {
      document.execCommand("insertText", false, nextMarkdown);
    } catch (err) {
      onChange(nextMarkdown);
    }

    setCurrentMatchIndex(0);
  };

  const replaceAllLiterals = () => {
    let result = markdown;
    for (let i = matches.length - 1; i >= 0; i--) {
      const match = matches[i];
      result = result.slice(0, match.start) + replaceQuery + result.slice(match.end);
    }
    return result;
  };

  // Check if find input has invalid regex
  const isRegexError = useMemo(() => {
    if (!useRegex || !findQuery) return false;
    try {
      new RegExp(findQuery);
      return false;
    } catch (e) {
      return true;
    }
  }, [findQuery, useRegex]);

  // Handle scroll syncing between textarea and highlight overlay
  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = e.currentTarget.scrollTop;
      overlayRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Render the text with highlighted marks inside the transparent overlay
  const renderHighlightedText = () => {
    if (!showReplacePanel || !findQuery || matches.length === 0) {
      return markdown;
    }

    const nodes: React.ReactNode[] = [];
    let lastIndex = 0;

    // Ensure matches are sorted sequentially
    const sortedMatches = [...matches].sort((a, b) => a.start - b.start);

    sortedMatches.forEach((match, idx) => {
      // Prior text
      if (match.start > lastIndex) {
        nodes.push(markdown.slice(lastIndex, match.start));
      }

      const isCurrent = idx === currentMatchIndex;
      nodes.push(
        <mark
          key={idx}
          className={isCurrent ? "search-highlight-current" : "search-highlight"}
        >
          {markdown.slice(match.start, match.end)}
        </mark>
      );

      lastIndex = match.end;
    });

    if (lastIndex < markdown.length) {
      nodes.push(markdown.slice(lastIndex));
    }

    return nodes;
  };

  return (
    <div className="editor-container">
      <div className="pane-header">
        <Edit3 size={16} />
        <h2>{t.editor}</h2>
      </div>

      {showReplacePanel && (
        <div
          className="find-replace-widget"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setShowReplacePanel(false);
              textareaRef.current?.focus();
            }
          }}
        >
          {/* Find Row */}
          <div className="find-replace-row">
            <div className="find-replace-chevron-col">
              <button
                type="button"
                className={`find-replace-chevron-btn ${!showReplaceRow ? "rotated" : ""}`}
                onClick={() => setShowReplaceRow(!showReplaceRow)}
                title={t.toggleReplace}
              >
                <ChevronDown size={14} />
              </button>
            </div>

            <div className="find-replace-input-col">
              <div className={`find-replace-input-wrapper ${isRegexError ? "has-error" : ""}`}>
                <input
                  ref={findInputRef}
                  type="text"
                  className="find-replace-input"
                  placeholder={t.find}
                  value={findQuery}
                  onChange={(e) => {
                    setFindQuery(e.target.value);
                    setCurrentMatchIndex(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (e.shiftKey) {
                        handlePrevMatch();
                      } else {
                        handleNextMatch();
                      }
                    } else if (e.key === "Tab" && !e.shiftKey && showReplaceRow) {
                      e.preventDefault();
                      replaceInputRef.current?.focus();
                      replaceInputRef.current?.select();
                    }
                  }}
                />
                <div className="find-replace-input-toggles">
                  <button
                    type="button"
                    className={`find-replace-toggle-btn ${matchCase ? "active" : ""}`}
                    onClick={() => {
                      setMatchCase(!matchCase);
                      setCurrentMatchIndex(0);
                    }}
                    title={`${t.matchCase} (Aa)`}
                  >
                    Aa
                  </button>
                  <button
                    type="button"
                    className={`find-replace-toggle-btn ${matchWholeWord ? "active" : ""}`}
                    onClick={() => {
                      setMatchWholeWord(!matchWholeWord);
                      setCurrentMatchIndex(0);
                    }}
                    title={`${t.matchWholeWord} (ab)`}
                    style={{ textDecoration: "underline" }}
                  >
                    ab
                  </button>
                  <button
                    type="button"
                    className={`find-replace-toggle-btn ${useRegex ? "active" : ""}`}
                    onClick={() => {
                      setUseRegex(!useRegex);
                      setCurrentMatchIndex(0);
                    }}
                    title={`${t.useRegex} (.*)`}
                  >
                    .*
                  </button>
                </div>
              </div>
            </div>

            <div className="find-replace-actions-col">
              <span className="find-replace-status">
                {matches.length > 0 ? `${currentMatchIndex + 1} of ${matches.length}` : "No results"}
              </span>

              <button
                type="button"
                className="find-replace-action-btn"
                disabled={matches.length === 0}
                onClick={handlePrevMatch}
                title={`${t.prevMatch} (Shift+Enter)`}
              >
                <ArrowUp size={14} />
              </button>

              <button
                type="button"
                className="find-replace-action-btn"
                disabled={matches.length === 0}
                onClick={handleNextMatch}
                title={`${t.nextMatch} (Enter)`}
              >
                <ArrowDown size={14} />
              </button>

              <button
                type="button"
                className="find-replace-action-btn"
                onClick={() => setShowReplacePanel(false)}
                title={`${t.close} (Escape)`}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Replace Row */}
          {showReplaceRow && (
            <div className="find-replace-row">
              <div className="find-replace-chevron-col">
                {/* Empty Spacer to align */}
              </div>

              <div className="find-replace-input-col">
                <div className="find-replace-input-wrapper">
                  <input
                    ref={replaceInputRef}
                    type="text"
                    className="find-replace-input"
                    placeholder={t.replace}
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleReplace();
                      } else if (e.key === "Tab") {
                        e.preventDefault();
                        findInputRef.current?.focus();
                        findInputRef.current?.select();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="find-replace-actions-col">
                <button
                  type="button"
                  className="find-replace-action-btn"
                  disabled={matches.length === 0}
                  onClick={handleReplace}
                  title={t.replace}
                >
                  {/* Replace Icon: b -> c with curved arrow */}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.5 13H4a2 2 0 0 1-2-2V8h1.5v3A.5.5 0 0 0 4 11.5h8.5v1.5Z" />
                    <path d="M10.854 13.854a.5.5 0 0 1 0-.708L12.793 11.2l-1.939-1.946a.5.5 0 0 1 .708-.708l2.293 2.3a.5.5 0 0 1 0 .708l-2.293 2.3a.5.5 0 0 1-.708 0ZM4.5 3h1v1.5h-1V3Zm3 0h1v1.5h-1V3Z" />
                  </svg>
                </button>

                <button
                  type="button"
                  className="find-replace-action-btn"
                  disabled={matches.length === 0}
                  onClick={handleReplaceAll}
                  title={t.replaceAll}
                >
                  {/* Replace All Icon */}
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M12.5 13H4a2 2 0 0 1-2-2V8h1.5v3A.5.5 0 0 0 4 11.5h8.5v1.5Z" />
                    <path d="M10.854 13.854a.5.5 0 0 1 0-.708L12.793 11.2l-1.939-1.946a.5.5 0 0 1 .708-.708l2.293 2.3a.5.5 0 0 1 0 .708l-2.293 2.3a.5.5 0 0 1-.708 0ZM4.5 3h1v1.5h-1V3Zm3 0h1v1.5h-1V3ZM4.5 6.5h1V8h-1V6.5Zm3 0h1V8h-1V6.5Z" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="editor-textarea-wrapper">
        {/* Scroll synced highlight overlay */}
        <div ref={overlayRef} className="editor-highlight-overlay">
          {renderHighlightedText()}
        </div>
        <textarea
          ref={textareaRef}
          value={markdown}
          onChange={(e) => onChange(e.target.value)}
          onScroll={handleScroll}
          placeholder="# Your Name..."
          className="editor-textarea"
          spellCheck="false"
        />
      </div>
      <div className="editor-footer">
        <span>{wordCount} words</span>
        <span>{charCount} characters</span>
      </div>
    </div>
  );
};



