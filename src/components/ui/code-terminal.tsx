"use client";

import { useRef, useState, useEffect } from "react";
import { Play, Trash2, Copy, Check, Upload, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAuthToken } from "@/lib/auth";

const MAX_CODE_LENGTH = 20000;

// Only keep the languages you want
const LANGUAGE_OPTIONS = [
  { value: "python", label: "🐍 Python" },
  { value: "javascript", label: "📜 JavaScript" },
  { value: "html", label: "🌐 HTML" }
];

const LANGUAGE_DEFAULTS: Record<string, string> = {
  python: `# Write your Python code here
def greet(name):
    return f"Hello, {name}!"

print(greet("AIRA"))`,
  javascript: `// Write your JavaScript code here
function greet(name) {
    return \`Hello, \${name}!\`;
}

console.log(greet("AIRA"));`,
  html: `<!DOCTYPE html>
<html>
<head>
    <title>My Page</title>
    <style>
        body { font-family: Arial; text-align: center; padding: 50px; }
        h1 { color: #e94560; }
        button { padding: 10px 20px; font-size: 16px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>Hello, AIRA!</h1>
    <p>This is a live HTML preview.</p>
    <button onclick="alert('Clicked!')">Click Me</button>
</body>
</html>`,
};

// ✅ DEFAULT_CODE is now defined
const DEFAULT_CODE = LANGUAGE_DEFAULTS.python;

export default function CodeTerminal() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>("python");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Input handling states
  const [needsInput, setNeedsInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [inputPrompt, setInputPrompt] = useState("");
  const [inputs, setInputs] = useState<string[]>([]);
  const [currentInputIndex, setCurrentInputIndex] = useState(0);

  // HTML preview state
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const htmlPreviewRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when needed
  useEffect(() => {
    if (needsInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [needsInput]);

  // Handle HTML preview
  useEffect(() => {
    if (htmlPreview && htmlPreviewRef.current) {
      htmlPreviewRef.current.innerHTML = "";
      
      const iframe = document.createElement("iframe");
      iframe.style.width = "100%";
      iframe.style.height = "400px";
      iframe.style.border = "none";
      iframe.style.borderRadius = "8px";
      iframe.style.backgroundColor = "white";
      iframe.sandbox = "allow-scripts allow-same-origin allow-modals";
      
      htmlPreviewRef.current.appendChild(iframe);
      
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(htmlPreview);
        doc.close();
      }
    }
  }, [htmlPreview]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Change language and set default code
  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    setCode(LANGUAGE_DEFAULTS[lang] || LANGUAGE_DEFAULTS.python);
    setOutput("");
    setHtmlPreview(null);
    setIsDropdownOpen(false);
  };

  // Handle Enter key in input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSubmitInput();
    }
  };

  // Main Run function
  const handleRun = async () => {
    if (!code.trim()) {
      setOutput("⚠️ Please enter some code to run.");
      return;
    }

    setIsRunning(true);
    setOutput("⏳ Running code...");
    setHtmlPreview(null);
    setNeedsInput(false);
    setInputValue("");
    setInputs([]);
    setCurrentInputIndex(0);
    setInputPrompt("");

    try {
      const token = getAuthToken();
      if (!token) {
        setOutput("❌ Not authenticated. Please login again.");
        setIsRunning(false);
        return;
      }

      // For HTML, render directly in browser
      if (language === "html") {
        setHtmlPreview(code);
        setOutput("🌐 HTML rendered below!");
        setIsRunning(false);
        return;
      }


const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/code/execute`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    code: code,
    language: language,
    outputOnly: true,
  }),
});

const data = await response.json();

if (!response.ok) {
  setOutput(`❌ Error: ${data.detail || data.error || "Execution failed"}`);
  setIsRunning(false);
  return;
}

// Handle turtle graphics
if (data.html && data.isTurtle) {
  setHtmlPreview(data.html);
  setOutput(data.output || "🐢 Turtle graphics rendered!");
  setIsRunning(false);
  return;
}

      // Handle input waiting
      if (data.needsInput) {
        setNeedsInput(true);
        setCurrentCode(code);
        const prompts = data.inputPrompt ? data.inputPrompt.split("|") : ["Enter your input"];
        setInputPrompt(data.inputPrompt || "");
        setInputs([]);
        setCurrentInputIndex(0);
        setOutput(`⏳ Program waiting for input:\n\n📝 ${prompts[0] || "Enter your input"}: `);
        setIsRunning(false);
        return;
      }

      setOutput(data.output || "✅ Program executed successfully (no output)");
    } catch (err: any) {
      setOutput(`❌ Error: ${err.message || "Failed to connect to server"}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Handle input submission
  const handleSubmitInput = async () => {
    if (!inputValue.trim()) return;

    const newInputs = [...inputs, inputValue];
    setInputs(newInputs);
    const currentVal = inputValue;
    setInputValue("");
    setCurrentInputIndex(newInputs.length);

    setOutput((prev) => prev + currentVal + "\n");

    const prompts = inputPrompt ? inputPrompt.split("|") : [];
    const totalInputs = prompts.length > 0 ? prompts.length : 1;

    if (newInputs.length >= totalInputs) {
      setIsRunning(true);
      setNeedsInput(false);
      setOutput((prev) => prev + "\n⏳ Processing inputs...\n");

      try {
        const token = getAuthToken();
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/code/execute`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            code: currentCode,
            language: language,
            outputOnly: true,
            inputs: newInputs,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          setOutput((prev) => prev + `\n❌ Error: ${data.detail || data.error || "Execution failed"}`);
          setIsRunning(false);
          setInputs([]);
          setCurrentInputIndex(0);
          return;
        }

        setOutput((prev) => prev + (data.output || "✅ Program executed successfully"));
      } catch (err: any) {
        setOutput((prev) => prev + `\n❌ Error: ${err.message || "Failed to connect to server"}`);
      } finally {
        setIsRunning(false);
        setInputs([]);
        setCurrentInputIndex(0);
      }
    } else {
      if (currentInputIndex < prompts.length) {
        setOutput((prev) => prev + `\n📝 ${prompts[currentInputIndex]}: `);
      }
    }
  };

  const handleClear = () => {
    setCode(LANGUAGE_DEFAULTS[language] || LANGUAGE_DEFAULTS.python);
    setOutput("");
    setHtmlPreview(null);
    setUploadError(null);
    setUploadedFileName(null);
    setNeedsInput(false);
    setInputValue("");
    setInputs([]);
    setCurrentInputIndex(0);
    setInputPrompt("");
    textareaRef.current?.focus();
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadError(null);

    try {
      const text = await file.text();
      if (text.includes("\0")) {
        setUploadError("Binary file detected.");
        return;
      }
      setCode(text.length > MAX_CODE_LENGTH ? text.slice(0, MAX_CODE_LENGTH) : text);
      setUploadedFileName(file.name);
      
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      const langMap: Record<string, string> = {
        ".py": "python",
        ".js": "javascript",
        ".html": "html",
        ".htm": "html",
        ".java": "java",
        ".cpp": "cpp",
        ".c": "c",
        ".go": "go",
        ".rs": "rust",
        ".rb": "ruby",
        ".php": "php",
      };
      if (langMap[ext]) {
        setLanguage(langMap[ext]);
      }
      setOutput("");
      setHtmlPreview(null);
      setNeedsInput(false);
    } catch {
      setUploadError("Could not read this file.");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const lineCount = code.split("\n").length;
  const currentLanguageLabel = LANGUAGE_OPTIONS.find(l => l.value === language)?.label || "Python";

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/90">
        {/* Header with Language Dropdown */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500/80" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/80" />
              <span className="h-3 w-3 rounded-full bg-green-500/80" />
            </div>
            <span className="text-sm font-medium text-neutral-300">AIRA Terminal</span>
            
            {/* ✅ Language Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 hover:bg-neutral-700 transition"
              >
                {currentLanguageLabel}
                <ChevronDown className="h-3 w-3" />
              </button>
              
              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-50 max-h-60 overflow-auto">
                  {LANGUAGE_OPTIONS.map((lang) => (
                    <button
                      key={lang.value}
                      onClick={() => handleLanguageChange(lang.value)}
                      className={cn(
                        "w-full px-3 py-2 text-left text-xs hover:bg-neutral-700 transition",
                        language === lang.value ? "text-violet-400 bg-neutral-700" : "text-neutral-300"
                      )}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {uploadedFileName && (
              <span className="text-xs text-neutral-500 max-w-44 truncate">
                {uploadedFileName}
              </span>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".py,.js,.jsx,.ts,.tsx,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.swift,.kt,.sql,.html,.css,.scss,.json,.xml,.yaml,.yml,.md,.txt,.sh,.bat"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={handleUploadClick}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
            <button
              onClick={handleRun}
              disabled={isRunning}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
                isRunning
                  ? "border-neutral-700 text-neutral-500 cursor-not-allowed"
                  : "border-violet-500/40 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20"
              )}
            >
              <Play className="h-3.5 w-3.5" />
              {isRunning ? "Running..." : "Run"}
            </button>
          </div>
        </div>

        {uploadError && (
          <p className="border-b border-neutral-800 bg-red-500/10 px-4 py-2 text-xs text-red-400">
            {uploadError}
          </p>
        )}

        {/* Editor */}
        <div className="relative">
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 overflow-hidden border-r border-neutral-800/60 bg-neutral-950/50 pt-4 text-right font-mono text-xs leading-6 text-neutral-600 select-none">
            {Array.from({ length: lineCount }).map((_, i) => (
              <div key={i} className="pr-3">{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onScroll={() => {
              if (textareaRef.current && lineNumbersRef.current) {
                lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const textarea = textareaRef.current;
                if (!textarea) return;
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                setCode(code.substring(0, start) + "  " + code.substring(end));
                requestAnimationFrame(() => {
                  textarea.selectionStart = textarea.selectionEnd = start + 2;
                });
              }
            }}
            spellCheck={false}
            className="block w-full min-h-75 resize-y bg-neutral-950/80 py-4 pl-14 pr-4 font-mono text-sm leading-6 text-neutral-100 focus:outline-none focus:ring-1 focus:ring-violet-500/20 placeholder:text-neutral-600"
            placeholder="# Start typing your code..."
          />
        </div>

        {/* Output Section */}
        <div className="border-t border-neutral-800">
          <div className="flex items-center justify-between px-4 py-2 bg-neutral-800/50">
            <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Output</span>
            {output && (
              <button onClick={() => setOutput("")} className="text-xs text-neutral-500 hover:text-neutral-300">
                Clear
              </button>
            )}
          </div>

          <div
            ref={outputRef}
            className="p-4 bg-black/40 min-h-20 max-h-50 overflow-auto font-mono text-sm leading-6 whitespace-pre-wrap"
          >
            {output ? (
              <div className="text-green-400">
                {output.split("\n").map((line, i) => (
                  <div key={i}>{line}</div>
                ))}

                {needsInput && (
                  <div className="flex flex-col gap-1 mt-1">
                    <div className="flex items-center gap-0">
                      <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        className="bg-transparent border-none outline-none text-green-400 font-mono text-sm flex-1 min-w-24 placeholder:text-neutral-500"
                        placeholder="Enter your input..."
                        autoFocus
                      />
                      <span className="text-green-400 animate-pulse">▊</span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-neutral-500">Run your code to see output here...</span>
            )}
          </div>
        </div>

        {/* HTML Preview Section */}
        {htmlPreview && (
          <div className="border-t border-neutral-800">
            <div className="px-4 py-2 bg-neutral-800/50">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">🌐 HTML Preview</span>
            </div>
            <div ref={htmlPreviewRef} className="p-2 bg-white min-h-100 flex justify-center items-center" />
          </div>
        )}
      </div>
    </div>
  );
}