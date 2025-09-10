import { openai } from "../config/openai.js";
import {
  tool_getPolicyById,
  tool_searchPolicies,
  tool_diffPolicies,
  tool_whoIsAffected,
  tool_getPolicyByFileName, 
  tool_diffPoliciesByFileName,
  tool_getUserProfile,
  tool_getMyProfile
} from "./chatbot.tools.js";

const SYSTEM_PROMPT = `
You are a helpful assistant for a healthcare insurance admin app.
You must never answer coverage or cost questions from memory. Always call the appropriate tools. 
If a question is purely conversational (no policy facts), you may answer briefly; otherwise call tools.
When you cite, include policy IDs and field names from tool results.
Do not fabricate data; if a tool returns nothing, say so.
Keep PHI minimal and only show patient info when explicitly requested by an authorized admin.
- When asked about costs, always compute using the tools.
`;

const TOOLS = [
     {
    type: "function",
    function: {
      name: "getMyProfile",
      description: "Return the signed-in user's medications and insuredAt (from server context).",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "computeMyCost",
      description: "Compute my out-of-pocket for my current meds under a policy file.",
      parameters: { type: "object", properties: { beFileName: { type: "string" } }, required: ["beFileName"] }
    }
  },
  {
    type: "function",
    function: {
      name: "recommendPolicyForMe",
      description: "Rank candidate policy files by lowest cost for me.",
      parameters: {
        type: "object",
        properties: { candidateFiles: { type: "array", items: { type: "string" } } },
        required: ["candidateFiles"]
      }
    }
    },
     {
    type: "function",
    function: {
      name: "getUserProfile",
      description: "Get a user's medications and insured policies by userId.",
      parameters: {
        type: "object",
        properties: { userId: { type: "string" } },
        required: ["userId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "computeCostForUser",
      description: "Compute out-of-pocket costs for a user's medications under a policy file.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
          beFileName: { type: "string" }
        },
        required: ["userId","beFileName"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "recommendPolicyByCost",
      description: "Rank candidate policy files by lowest cost for a user.",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
          candidateFiles: { type: "array", items: { type: "string" } }
        },
        required: ["userId","candidateFiles"]
      }
    }
  },
  {
   type: "function",
   function: {
     name: "getPrices",
     description: "Get unit prices for medications (formulary).",
     parameters: {
       type: "object",
       properties: { medications: { type: "array", items: { type: "string" }, minItems: 1 } },
       required: ["medications"]
     }
   }
 },
  {
    type: "function",
    function: {
      name: "getPolicyById",
      description: "Fetch a policy by Firestore document ID (policies/{id}).",
      parameters: {
        type: "object",
        properties: {
          policyId: { type: "string", description: "The Firestore document ID" }
        },
        required: ["policyId"]
      }
    }
  },
  {
  type: "function",
  function: {
    name: "getPolicyByFileName",
    description: "Fetch a policy by its beFileName (like POL_SUN_GENERAL_2026-01-01.pdf).",
    parameters: {
      type: "object",
      properties: {
        beFileName: { type: "string" }
      },
      required: ["beFileName"]
    }
  }
},
{
  type: "function",
  function: {
    name: "diffPoliciesByFileName",
    description: "Compare two policies by beFileName and list changed medications.",
    parameters: {
      type: "object",
      properties: {
        oldFile: { type: "string" },
        newFile: { type: "string" }
      },
      required: ["oldFile", "newFile"]
    }
  }
}
,
  {
    type: "function",
    function: {
      name: "searchPolicies",
      description: "Search policies by partial name or filename.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string" },
          limit: { type: "number" }
        },
        required: ["q"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "diffPolicies",
      description: "Compare two policies and list changed medications.",
      parameters: {
        type: "object",
        properties: {
          oldPolicyId: { type: "string" },
          newPolicyId: { type: "string" }
        },
        required: ["oldPolicyId", "newPolicyId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "whoIsAffected",
      description: "Return latest impact report(s) for a policy (affected patients).",
      parameters: {
        type: "object",
        properties: {
         policyId: { type: "string", description: "Firestore doc ID" },
        beFileName: { type: "string", description: "Alternative to policyId" },
        limit: { type: "number" }
        },
        required: []
      }
    }
  }
];

async function dispatchTool(name, args, context) {
  try {
    switch (name) {
      case "getPolicyById":  return await tool_getPolicyById(args);
      case "searchPolicies": return await tool_searchPolicies(args);
      case "diffPolicies":   return await tool_diffPolicies(args);
      case "whoIsAffected":  return await tool_whoIsAffected(args);
      case "getPolicyByFileName": return await tool_getPolicyByFileName(args);
      case "diffPoliciesByFileName": return await tool_diffPoliciesByFileName(args);
      case "getUserProfile":        return await tool_getUserProfile(args);
      case "computeCostForUser":    return await tool_computeCostForUser(args);
      case "recommendPolicyByCost": return await tool_recommendPolicyByCost(args);
      case "getPrices":             return await tool_getPrices(args);
      case "getMyProfile":          return await tool_getMyProfile({}, context);
      case "computeMyCost":         return await tool_computeMyCost(args, context);
      case "recommendPolicyForMe":  return await tool_recommendPolicyForMe(args, context);
      
    default: return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

// chatbot.service.js
export async function chatWithTools({ messages, context }) {
  const initial = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    tools: TOOLS,
    tool_choice: "auto"
  });

  let assistantMsg = initial.choices[0].message;
  let history = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  for (let step = 0; step < 4; step++) {
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      return { answer: assistantMsg.content ?? "" };
    }
    const toolResponses = [];
    for (const tc of assistantMsg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || "{}");
      const result = await dispatchTool(tc.function.name, args, context);
      toolResponses.push({
        role: "tool",
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result)
      });
    }
    history = [{ role: "system", content: SYSTEM_PROMPT }, ...messages, assistantMsg, ...toolResponses];
    const next = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: history,
      tools: TOOLS,
      tool_choice: "auto"
    });
    assistantMsg = next.choices[0].message;
  }
  return { answer: assistantMsg.content ?? "" };
}

