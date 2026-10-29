// D:\RAG-UI-main\server\test-models.ts

import { config } from './src/config.js';

async function testModels() {
    console.log("Testing Available Groq Models\n");
    console.log("=".repeat(60));
    
    // Show the API key status (first 10 chars for debugging)
    console.log(`API Key loaded: ${config.groqApiKey ? 'YES' : 'NO'}`);
    if (config.groqApiKey) {
        console.log(`API Key starts with: ${config.groqApiKey.substring(0, 10)}...`);
    }
    console.log("=".repeat(60));
    
    // Models that work with your account
    const models = [
        "openai/gpt-oss-20b",     // Fast, simple tasks
        "openai/gpt-oss-120b",    // Complex reasoning
        "qwen/qwen3.6-27b",       // Alternative
        "moonshotai/kimi-k2-instruct"  // Preview
    ];
    
    for (const model of models) {
        console.log(`\nTesting: ${model}`);
        try {
            const response = await fetch(`${config.groqBaseUrl}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${config.groqApiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    messages: [{ role: "user", content: "Say hello in 2 words" }],
                    max_tokens: 20,
                    temperature: 0.1
                }),
                signal: AbortSignal.timeout(10000)
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`SUCCESS: ${model} is available`);
                console.log(`   Response: ${data.choices?.[0]?.message?.content}`);
            } else {
                const error = await response.json();
                console.log(`FAILED: ${model} - ${error.error?.message || response.status}`);
            }
        } catch (error: any) {
            console.log(`ERROR: ${model} - ${error.message}`);
        }
    }
}

testModels();