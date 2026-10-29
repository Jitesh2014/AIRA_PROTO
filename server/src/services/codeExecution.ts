// server/src/services/codeExecution.ts

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

export interface CodeExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  execution_time?: number;
  isGUI?: boolean;
  needsInput?: boolean;
  html?: string;
}

// Helper: Check if code uses turtle graphics
function usesTurtle(code: string): boolean {
  const keywords = ["import turtle", "from turtle import", "turtle.", "Screen()", "Turtle()", "exitonclick", "done()"];
  return keywords.some(k => code.includes(k));
}

// Helper: Check if code needs input
function usesInput(code: string): boolean {
  return code.includes("input(");
}

// Extract turtle commands from code
function extractTurtleCommands(code: string): any[] {
  const commands: any[] = [];
  const lines = code.split('\n').filter(l => !l.trim().startsWith('#'));
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes('.forward(') || trimmed.includes('.fd(')) {
      const m = trimmed.match(/\.(?:forward|fd)\((\d+)\)/);
      if (m) commands.push({ type: 'forward', value: parseInt(m[1]) });
    } else if (trimmed.includes('.backward(') || trimmed.includes('.bk(')) {
      const m = trimmed.match(/\.(?:backward|bk)\((\d+)\)/);
      if (m) commands.push({ type: 'forward', value: -parseInt(m[1]) });
    } else if (trimmed.includes('.left(') || trimmed.includes('.lt(')) {
      const m = trimmed.match(/\.(?:left|lt)\((\d+)\)/);
      if (m) commands.push({ type: 'left', value: parseInt(m[1]) });
    } else if (trimmed.includes('.right(') || trimmed.includes('.rt(')) {
      const m = trimmed.match(/\.(?:right|rt)\((\d+)\)/);
      if (m) commands.push({ type: 'right', value: parseInt(m[1]) });
    } else if (trimmed.includes('.penup(') || trimmed.includes('.pu(')) {
      commands.push({ type: 'penup' });
    } else if (trimmed.includes('.pendown(') || trimmed.includes('.pd(')) {
      commands.push({ type: 'pendown' });
    } else if (trimmed.includes('.color(')) {
      const m = trimmed.match(/\.color\(['"]([^'"]+)['"]\)/);
      if (m) commands.push({ type: 'color', value: m[1] });
    } else if (trimmed.includes('.pensize(')) {
      const m = trimmed.match(/\.pensize\((\d+)\)/);
      if (m) commands.push({ type: 'pensize', value: parseInt(m[1]) });
    } else if (trimmed.includes('.circle(')) {
      const m = trimmed.match(/\.circle\((\d+)\)/);
      if (m) commands.push({ type: 'circle', value: parseInt(m[1]) });
    } else if (trimmed.includes('.goto(')) {
      const m = trimmed.match(/\.goto\((\d+),\s*(\d+)\)/);
      if (m) commands.push({ type: 'goto', x: parseInt(m[1]), y: parseInt(m[2]) });
    }
  }
  return commands;
}

// Generate Turtle HTML
function generateTurtleHTML(code: string): string {
  const commands = extractTurtleCommands(code);
  
  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Turtle Graphics</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            background: #1a1a2e; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            min-height: 450px;
            font-family: monospace;
            padding: 10px;
        }
        .turtle-container {
            background: #16213e;
            padding: 16px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
            max-width: 100%;
            width: 540px;
        }
        .turtle-container h3 {
            color: #e0e0e0;
            text-align: center;
            margin-bottom: 10px;
            font-size: 14px;
            font-weight: normal;
        }
        canvas {
            border: 2px solid #0f3460;
            border-radius: 8px;
            background: white;
            display: block;
            margin: 0 auto;
            width: 500px;
            height: 500px;
            max-width: 100%;
        }
        .turtle-controls {
            margin-top: 12px;
            display: flex;
            gap: 10px;
            justify-content: center;
            flex-wrap: wrap;
        }
        .turtle-controls button {
            background: #e94560;
            color: white;
            border: none;
            padding: 8px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-family: monospace;
            transition: all 0.3s;
        }
        .turtle-controls button:hover {
            background: #c73652;
            transform: scale(1.05);
        }
        .turtle-controls button.reset {
            background: #533483;
        }
        .turtle-controls button.reset:hover {
            background: #3d2763;
        }
        .turtle-info {
            color: #888;
            text-align: center;
            margin-top: 8px;
            font-size: 11px;
        }
    </style>
</head>
<body>
    <div class="turtle-container">
        <h3>🐢 Turtle Graphics</h3>
        <canvas id="turtleCanvas" width="500" height="500"></canvas>
        <div class="turtle-controls">
            <button class="reset" onclick="resetTurtle()">🔄 Reset</button>
            <button onclick="runTurtle()">▶️ Run</button>
        </div>
        <div class="turtle-info">Click Run to draw</div>
    </div>
    <script>
        const canvas = document.getElementById('turtleCanvas');
        const ctx = canvas.getContext('2d');
        let turtle = {
            x: 250, y: 250, angle: -90,
            penDown: true, color: '#e94560', size: 3
        };
        const commands = ${JSON.stringify(commands)};

        function drawTurtle() {
            ctx.save();
            ctx.translate(turtle.x, turtle.y);
            ctx.rotate(turtle.angle * Math.PI / 180);
            ctx.beginPath();
            ctx.moveTo(12, 0);
            ctx.lineTo(-8, -8);
            ctx.lineTo(-8, 8);
            ctx.closePath();
            ctx.fillStyle = turtle.color;
            ctx.fill();
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
        }

        function drawLine(x1, y1, x2, y2) {
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.strokeStyle = turtle.color;
            ctx.lineWidth = turtle.size;
            ctx.stroke();
        }

        function resetTurtle() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#f0f0f0';
            ctx.lineWidth = 0.5;
            for (let i = 0; i <= canvas.width; i += 50) {
                ctx.beginPath();
                ctx.moveTo(i, 0);
                ctx.lineTo(i, canvas.height);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, i);
                ctx.lineTo(canvas.width, i);
                ctx.stroke();
            }
            turtle.x = 250;
            turtle.y = 250;
            turtle.angle = -90;
            turtle.penDown = true;
            turtle.color = '#e94560';
            turtle.size = 3;
            drawTurtle();
        }

        function runTurtle() {
            resetTurtle();
            let t = { ...turtle };
            for (const cmd of commands) {
                if (cmd.type === 'forward') {
                    const rad = t.angle * Math.PI / 180;
                    const dx = Math.cos(rad) * cmd.value;
                    const dy = Math.sin(rad) * cmd.value;
                    const nx = t.x + dx, ny = t.y + dy;
                    if (t.penDown) drawLine(t.x, t.y, nx, ny);
                    t.x = nx; t.y = ny;
                } else if (cmd.type === 'left') { t.angle -= cmd.value;
                } else if (cmd.type === 'right') { t.angle += cmd.value;
                } else if (cmd.type === 'penup') { t.penDown = false;
                } else if (cmd.type === 'pendown') { t.penDown = true;
                } else if (cmd.type === 'color') { t.color = cmd.value;
                } else if (cmd.type === 'pensize') { t.size = cmd.value;
                } else if (cmd.type === 'circle') {
                    ctx.beginPath();
                    ctx.arc(t.x, t.y, cmd.value, 0, 2 * Math.PI);
                    ctx.strokeStyle = t.color;
                    ctx.lineWidth = t.size;
                    ctx.stroke();
                } else if (cmd.type === 'goto') {
                    if (t.penDown) drawLine(t.x, t.y, cmd.x, cmd.y);
                    t.x = cmd.x; t.y = cmd.y;
                }
            }
            turtle = t;
            drawTurtle();
        }

        window.onload = function() {
            resetTurtle();
            setTimeout(runTurtle, 300);
        };
    </script>
</body>
</html>`;
}

// Execute with Piston API
async function executeWithPiston(code: string, language: string, inputs?: string[]): Promise<CodeExecutionResult> {
  const PISTON_URL = process.env.PISTON_URL || "http://localhost:2000";
  const startTime = Date.now();
  
  try {
    const langMap: Record<string, string> = {
      python: "python",
      javascript: "javascript"
    };
    
    const pistonLang = langMap[language] || language;
    
    const response = await fetch(`${PISTON_URL}/api/v2/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: pistonLang,
        version: "*",
        files: [{ content: code }],
        stdin: inputs ? inputs.join("\n") : "",
        compile_timeout: 15000,
        run_timeout: 10000,
      }),
    });

    const data = await response.json();
    
    if (response.ok) {
      const output = data.run?.output || data.output || "";
      const error = data.run?.stderr || data.stderr || "";
      
      if (error && error.trim()) {
        return { 
          success: false, 
          output: output || "", 
          error: error.trim(),
          execution_time: Date.now() - startTime
        };
      }
      
      return { 
        success: true, 
        output: output.trim() || "No output",
        execution_time: Date.now() - startTime
      };
    } else {
      return { 
        success: false, 
        output: "", 
        error: `Piston API error: ${data.message || data.error || "Unknown error"}`,
        execution_time: Date.now() - startTime
      };
    }
  } catch (error: any) {
    return { 
      success: false, 
      output: "", 
      error: `Failed to execute code: ${error.message || "Unknown error"}`
    };
  }
}

// Local execution
async function executeLocal(code: string, language: string, withGUI: boolean = false): Promise<CodeExecutionResult> {
  const extMap: Record<string, string> = {
    python: "py",
    javascript: "js"
  };
  
  const ext = extMap[language];
  if (!ext) {
    return { success: false, output: "", error: `Language ${language} not supported for local execution` };
  }

  const tempDir = path.join(__dirname, "..", "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  const tempFile = path.join(tempDir, `temp_${Date.now()}.${ext}`);
  fs.writeFileSync(tempFile, code);

  try {
    const startTime = Date.now();
    const cmd = language === "python" ? "python" : "node";
    
    const { stdout, stderr } = await execAsync(`"${cmd}" "${tempFile}"`, {
      timeout: withGUI ? 30000 : 10000,
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });

    try { fs.unlinkSync(tempFile); } catch (e) {}

    if (stderr && stderr.trim()) {
      return { success: false, output: stdout || "", error: stderr.trim(), execution_time: Date.now() - startTime };
    }

    return { success: true, output: stdout.trim() || "No output", execution_time: Date.now() - startTime };
  } catch (error: any) {
    try { fs.unlinkSync(tempFile); } catch (e) {}
    return { success: false, output: "", error: error.message || "Execution failed" };
  }
}

// Main execution function
export async function executeCodeWithFallback(code: string, language: string = "python", inputs?: string[]): Promise<CodeExecutionResult> {
  console.log(`🔍 Executing ${language} with ${inputs?.length || 0} inputs`);

  // 1. Handle Turtle Graphics (Python only)
  if (language === "python" && usesTurtle(code)) {
    return {
      success: true,
      output: "🐢 Turtle graphics rendered in browser!",
      html: generateTurtleHTML(code),
      isGUI: true
    };
  }

  // 2. Handle HTML (render in browser)
  if (language === "html") {
    return {
      success: true,
      output: "HTML rendered in browser!",
      html: code,
      isGUI: true
    };
  }

  // 3. Handle Python with input
  if (language === "python" && usesInput(code)) {
    if (inputs && inputs.length > 0) {
      return await executeLocal(code, language);
    }
    return { success: false, output: "", error: "⏳ Program waiting for input...", needsInput: true };
  }

  // 4. Use Piston for Python & JavaScript
  if (language === "python" || language === "javascript") {
    try {
      const result = await executeWithPiston(code, language, inputs);
      if (result.success) return result;
    } catch (e) {
      console.log("🔄 Piston failed, falling back to local...");
    }
    return await executeLocal(code, language);
  }

  return { success: false, output: "", error: `Language ${language} not supported` };
}

// Format result for display
export function formatCodeExecutionResult(result: CodeExecutionResult, code: string): string {
  let response = `## 💻 Code Execution Result\n\n`;
  if (result.success) {
    response += `### ✅ Execution Successful${result.execution_time ? ` (${result.execution_time}ms)` : ''}\n\n`;
    response += `**Output:**\n\`\`\`\n${result.output}\n\`\`\`\n\n`;
    if (result.isGUI) response += `*🖼️ Graphics window opened*`;
  } else {
    response += `### ❌ Execution Failed\n\n`;
    response += `**Error:**\n\`\`\`\n${result.error}\n\`\`\`\n\n`;
  }
  return response;
}