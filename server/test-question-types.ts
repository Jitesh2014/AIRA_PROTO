// server/test-question-types.ts
import { queryRag } from './src/services/rag.js';

async function testQuestionTypes() {
    console.log("🧪 Testing Question Types\n");
    console.log("=".repeat(60));
    
    const tests = [
        {
            name: "MCQs - Concept Check",
            query: "Generate 5 MCQs from Chapter 3 with concept check, application, competency, reasoning, and output prediction types"
        },
        {
            name: "MCQs - Simple",
            query: "Generate 5 MCQs from Chapter 3"
        },
        {
            name: "Short Questions",
            query: "Generate 5 short questions from Chapter 3" 
        },
        {
            name: "Long Questions",
            query: "Generate 3 long questions from Chapter 3"
        },
        {
            name: "Hot Questions",
            query: "Generate 5 hot questions from Chapter 3"
        }
    ];
    
    for (const test of tests) {
        console.log(`\n📝 ${test.name}`);
        console.log(`   Query: ${test.query}`);
        console.log("-".repeat(40));        
        try {
            const result = await queryRag({
                question: test.query,
                schoolId: "test",
                filters: { chapter: "3" }
            });
            
            console.log(`   ✅ Success: ${result.llm_generated}`);
            console.log(`   📊 Sources: ${result.sources.length}`);
            console.log(`   🤖 Model: ${result.model_used}`);
            
            // Count questions in answer
            const questionCount = (result.answer.match(/\d+\./g) || []).length;
            console.log(`   📝 Questions in response: ${questionCount}`);
            
            // Show first 200 chars of answer
            console.log(`   💡 Answer Preview: ${result.answer.substring(0, 300)}...`);
            
        } catch (error: any) {
            console.log(`   ❌ ERROR: ${error.message}`);
        }
    }
}

testQuestionTypes();