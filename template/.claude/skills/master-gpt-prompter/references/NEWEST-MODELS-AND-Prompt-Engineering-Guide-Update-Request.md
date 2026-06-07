The Ultimate Guide to Prompt
Engineering & Context Architecture:
Late 2025 Edition
1. Introduction: The Architectural Turn in Generative
AI
The period between August 2025 and November 2025 marks a definitive schism in the history
of artificial intelligence interaction design. For years, the industry operated under the
paradigm of "Prompt Engineering"—a discipline largely characterized by linguistic heuristics,
stochastic trial-and-error, and the pursuit of "magic words" to coerce models into
compliance. By late 2025, this era has effectively concluded. We have entered the age of
Context Architecture and Agentic Systems Engineering.
The releases of GPT-5.1 (November 2025), Claude 3.5/4.5 Opus (November 2025), and
Gemini 3 (November 2025) have fundamentally altered the atomic unit of development.
1 The
prompt is no longer a static string of text; it is a dynamic, structured environment. The Large
Language Model (LLM) is no longer a chatbot; it is a stateless reducer within a complex
computational graph.
4
This report provides an exhaustive, technical analysis of this new landscape. It is not a
collection of "tips and tricks," but a rigorous examination of the engineering principles
required to build reliable, scalable AI systems using the frontier models of late 2025. We will
explore the "Thinking" paradigms of GPT-5.1, the "Effort" economics of Claude 4.5, the "Vibe
Coding" methodology of Gemini 3, and the foundational shift toward 12-Factor Agent
architectures.
5
Our analysis derives exclusively from technical documentation, research papers, and
developer reports released between August and November 2025, ensuring that every insight
reflects the absolute state of the art.
2. GPT-5.1: The Engineering of "Thinking"
The release of GPT-5 on August 7, 2025, followed by the significant GPT-5.1 update on
November 12, 2025, introduced a bifurcation in model behavior that demands a complete
reimagining of prompt strategies.
1 The central innovation of the 5.1 series is the formalization
of "Reasoning" not as an emergent property of Chain-of-Thought (CoT) prompting, but as a
steerable, native system state.
2.1 The Bifurcation: Instant vs. Thinking Models
In the GPT-4 era, reasoning was opaque. Developers induced it via "step-by-step"
instructions, but the model's internal computational budget was largely fixed. GPT-5.1
exposes this latent variable, splitting the inference capability into two distinct modes: GPT-5.1
Instant and GPT-5.1 Thinking.
1
2.1.1 GPT-5.1 Instant: Warmer, Faster, Conversational
The "Instant" variant is optimized for low-latency interactions. It is designed to be "warmer"
and more "playful" by default.
1 For the prompt engineer, this necessitates a shift in constraint
management. The model's inherent bias toward conversational fluidity can lead to verbosity in
technical tasks.
● Implication: When using GPT-5.1 Instant for data extraction or strict formatting,
developers must apply stronger "negative constraints" (e.g., "Do not offer pleasantries,"
"Output raw JSON only") than were required for GPT-4o, due to the model's reinforced
RLHF (Reinforcement Learning from Human Feedback) bias toward helpfulness and
warmth.
1
2.1.2 GPT-5.1 Thinking: Externalized Cognition
The "Thinking" model (evolution of the o-series) introduces "Thinking Tokens"—a compute
budget allocated to internal reasoning before the first output token is generated. This is
critical for agentic workflows. The November 12 update improved the "steerability" of this
thinking process, allowing developers to shape how the model reasons, not just what it
answers.
7
2.2 Advanced Steerability Protocols
The OpenAI Cookbook for GPT-5.1 (November 2025) introduces a new syntax for controlling
these models: XML-tagged Steerability Blocks.
8 These are not merely formatting
suggestions; they act as "hyper-parameters" for the inference engine.
2.2.1 The <solution_persistence> Pattern
One of the most persistent failure modes in agentic AI is "premature termination." An agent
tasked with a complex refactoring job often stops at the analysis phase or asks the user for
permission to proceed, breaking the autonomous loop.
To counteract this, the <solution_persistence> tag is employed. This tag explicitly overrides
the model's safety/passivity bias.
Technical Mechanism:
The prompt instructs the model to adopt the persona of an "autonomous senior
pair-programmer."
● Instruction: "Treat yourself as an autonomous senior pair-programmer... Persist until the
task is fully handled end-to-end within the current turn... Be extremely biased for action."
● Reasoning: By explicitly stating "If the user asks a question like 'should we do x?' and
your answer is 'yes', you should also go ahead and perform the action," the prompt
engineer short-circuits the RLHF alignment that prioritizes user consent over task
completion. This is essential for non-interactive ("headless") agents running in
background processes.
8
2.2.2 The <output_verbosity_spec> Pattern
With the increased intelligence of GPT-5.1 comes increased verbosity—the model wants to
explain its brilliant reasoning. In production systems (e.g., CLI tools, API integrations), this
"chatter" is noise.
The <output_verbosity_spec> tag provides a strict schema for brevity:
● Constraint: "Respond in plain text styled in Markdown, using at most 2 concise
sentences. Lead with what you did... For code, reference file paths... only if necessary."
● Application: This pattern is particularly effective when combined with the "Instant"
model for high-throughput tasks, ensuring that token costs remain manageable and
downstream parsers are not overwhelmed by conversational fluff.
8
2.3 User Updates and Preambles
A unique feature of the GPT-5.1 architecture is its handling of "User Updates" or
"Preambles"—the text generated while the model is executing tools but before the final
answer.
For long-running agentic tasks (e.g., "Research this company and write a report"), silence is
fatal to the user experience. The user perceives the system as "hanging."
The Immediacy Pattern:
Prompt engineers must now explicitly choreograph the model's "internal monologue" to be
visible at strategic intervals.
● Prompt Directive: <user_update_immediacy> Always explain what you're doing in a
commentary message FIRST, BEFORE sampling an analysis thinking message.
</user_update_immediacy>
● Effect: This forces the model to flush its buffer ("I am now searching for...") before
entering the high-latency reasoning block. This simple structural change reduces the
perceived latency of GPT-5.1 Thinking models by providing immediate feedback, even if
the total wall-clock time remains unchanged.
8
2.4 The "Planning Tool" Requirement
For complex tasks involving multi-file edits or multi-step reasoning, GPT-5.1 exhibits higher
reliability when forced to externalize its state into a "Plan." This is not just internal
Chain-of-Thought; it is a requirement to use a specific tool (e.g., todo_tool or plan_tool) to
record progress.
The <plan_tool_usage> Directive:
"For medium or larger tasks... you MUST create and maintain a lightweight plan in the
TODO/plan tool before the first code/tool action."
● State Management: The model must mark items as in_progress or completed.
● Invariant: "Finish with all items completed... before ending the turn."
This technique effectively forces the model to maintain a "State Machine" of its own
progress, preventing it from losing track of sub-tasks during long context windows.8
3. Claude 4.5: The Economics of "Effort"
While OpenAI focused on the "Thinking" modality, Anthropic's release of Claude Opus 4.5 in
late November 2025 introduced a different, perhaps more pragmatic, primitive: the Effort
Parameter.
2
3.1 The Effort Parameter: A First-Class API Object
Prior to November 2025, controlling the "depth" of a model's analysis was a vague exercise in
prompting ("Be thorough," "Think deeply"). Anthropic formalized this into a discrete API
parameter: effort. This control allows developers to trade off between Token Efficiency
(Cost/Speed) and Reasoning Depth (Quality/Completeness).
10
Effort Level Technical
Characteristics
Ideal Use Case Token Economics
Low Aggressive token
conservation.
Minimal preamble.
Fast "System 1"
heuristics.
High-volume
classification,
routing, simple data
extraction.
Lowest cost,
sub-second
latency.
Medium Balanced
reasoning.
Standard CoT.
General-purpose
chatbots, RAG
synthesis, email
drafting.
Standard pricing.
High Exhaustive search.
Deep CoT.
Multi-step
Complex coding
(SWE-bench), legal
analysis, scientific
Highest cost,
extended latency.
self-correction. research.
Code Implementation:
The shift from prompt engineering to API configuration is visible in the Python SDK update:
Python
response = client.beta.messages.create(
model="claude-opus-4-5-20251101",
betas=["effort-2025-11-24"],
output_config={"effort": "medium"}, # The new control knob
messages=[...]
)
11
Implications for Engineering:
This parameter deprecates complex "prompt hacking" designed to force brevity. Instead of
prepending "Be brief, no yapping" to a system prompt (which consumes input tokens and
degrades adherence), engineers simply set effort="low". Conversely, for critical tasks, setting
effort="high" activates internal reasoning loops that exceed what can be achieved through
prompting alone. Benchmarks show effort="high" improves performance on SWE-bench by
over 4 percentage points compared to standard usage.9
3.2 Computer Use and Visual Context Engineering
Claude 4.5 solidified its position as the leader in "Computer Use"—the ability to navigate GUIs,
click buttons, and type text. However, this capability introduces new "Visual Prompting"
challenges.
13
3.2.1 The Zoom Tool Pattern
A critical limitation of Vision Language Models (VLMs) is resolution. When viewing a
high-density screen (e.g., a spreadsheet or complex IDE), the model often hallucinates small
text.
Context Engineering Solution:
The "Zoom Tool" pattern involves giving the agent a specific tool definition (zoom(x, y, width,
height)) and instructing it to use this tool before attempting to read fine details.
● Prompt Strategy: "If you cannot read a value clearly, do not guess. Use the zoom tool to
inspect the region first."
This simple instruction transforms the model from a passive observer to an active
investigator, significantly reducing hallucination rates in GUI automation tasks.13
3.2.2 File System vs. Context Window
With Claude 4.5's ability to create files, a confusion often arises between "What is in the
context window?" and "What is on the virtual disk?".
The Context Separation Pattern:
Prompts must explicitly distinguish between these states:
● "For files md, txt, csv... assume their content is present in the context window."
● "For other files, or files created during the session, you must use the view tool or bash to
read them."
This prevents the model from hallucinating file contents that exist on the disk but have
not been loaded into its active memory.14
3.3 Programmatic Tool Calling
Claude 4.5 introduced "Programmatic Tool Calling," allowing the model to invoke tools inside a
code execution environment rather than via JSON-RPC stops.
Benefit: This reduces latency and token usage in multi-tool workflows. Instead of:
Model -> Stop -> Client runs Tool A -> Model -> Stop -> Client runs Tool B
The model generates:
Python
result_a = tool_a()
result_b = tool_b(result_a)
Prompting Strategy:
The system prompt must explicitly authorize and encourage this behavior: "Combine multiple
operations into a single code block where dependencies allow. Do not return intermediate
steps unless requested." This encourages the model to "batch" its reasoning into larger, more
efficient chunks.2
4. Gemini 3: The Era of "Vibe Coding"
If GPT-5.1 is the "Thinker" and Claude 4.5 is the "Worker," Google's Gemini 3 (released
November 18, 2025) is the "Creator." Its integration into the "Anti-Gravity" IDE and the
concept of "Vibe Coding" represent a radical departure from traditional coding assistants.
3
4.1 Vibe Coding: A New Methodology
"Vibe Coding" is defined as the practice of building software using natural language as the
primary syntax, where the prompt focuses on aesthetics, behavior, and high-level architecture
(the "Vibe") rather than implementation details.
15 This is enabled by Gemini 3's massive
context window (up to 2M tokens) and superior prompt adherence.
4.1.1 The "Senior Prompt" vs. "Lazy Prompt"
Research from November 2025 highlights a critical distinction in Vibe Coding success.
● The Lazy Prompt: "Make a todo app that looks cool."
○ Result: Generic div soup, hardcoded colors, unmaintainable code.
● The Senior Prompt: A structured specification that injects architectural constraints.
The "Senior Prompt" Template:
This template, derived from successful Vibe Coding case studies, uses specific "Constraint
Injection" blocks 16:
1. Role/Vibe: "You are a Senior Frontend Engineer. Vibe: Calm, minimal, accessible.
Constraints: TypeScript strict, no magic imports."
2. Product Brief: Bulleted feature list (e.g., "Authless todo, localStorage sync").
3. Tech Rails: Explicit stack definition. "Vite+React, /src/components architecture, Tailwind
tokens."
4. Design Tokens: This is crucial. Instead of letting the model guess colors, the prompt
injects the design system: "Primary: #333, Spacing: 4px scale."
5. Output Rules: "Return git-style diffs only."
By providing these Tech Rails and Design Tokens, the developer constrains the model's
immense creative variance into a production-ready channel. The model handles the
implementation (the "how"), but the prompt dictates the architecture (the "what").
17
4.2 Native Bash Integration & Anti-Gravity
Gemini 3 includes a native, client-side Bash tool. This allows it to "drive" the development
environment directly.18
Agentic Workflow Example:
● User: "Refactor the authentication logic to use JWT."
● Gemini 3:
1. Uses grep to find all auth references.
2. Uses cat to read the relevant files.
3. Writes the new code.
4. Runs npm test to verify.
5. Fixes any errors found.
Prompting for Safety:
With great power comes great risk. Prompts for Gemini 3 in CLI environments must include
strict Negative Constraints:
● "Do not execute destructive commands (rm, format) without explicit confirmation."
● "Always verify the current working directory before creating files."
These "Safety Rails" are essential when giving an LLM direct access to a shell.19
4.3 Context Caching Strategies
Gemini 3's long context allows for Context Caching—storing the entire codebase +
documentation in the cache.
Optimization Pattern:
● Static Context: Library documentation, design system specs, project readme. (Cached
once).
● Dynamic Context: The specific file being edited, the user's latest query. (Appended).
Prompt engineers must structure their requests to maximize cache hits, ensuring that the
heavy static context is placed first in the message history, with dynamic queries at the
end.20
5. Context Engineering: The Science of Memory
By late 2025, the term "Prompt Engineering" is increasingly viewed as a subset of Context
Engineering. If the LLM is the CPU, the Context Window is the RAM. Context Engineering is
the discipline of managing this memory to prevent "Context Rot" (the degradation of
performance as context fills up) and ensure reliable retrieval.
21
5.1 The Context Architecture
Effective Context Engineering treats the context window not as a text buffer, but as a
structured database.
5.1.1 Transient vs. Persistent Context
● Transient Context: This is the "Working Memory" of the agent. It includes the system
prompt, the immediate conversation history, and the outputs of tools called in the current
session. It is volatile and re-constructed for every inference call.
● Persistent Context: This is the "Long-Term Memory." It resides in external databases
(Vector Stores, SQL, GraphDBs) and is retrieved "Just-in-Time" (JIT) to populate the
Transient Context.
The Engineering Challenge: The art of Context Engineering lies in the Selection
Strategy—deciding exactly what piece of Persistent Context to load into Transient Context for
a given query.
21
5.2 The Context Funnel: Select, Compress, Isolate
To manage the massive 200k–2M token windows available in late 2025 without incurring
prohibitive latency or "distraction," engineers employ the Context Funnel pattern.
23
1. Select (RAG/Tools): Use retrieval systems to identify potentially relevant documents.
2. Compress (Summarization): Instead of injecting raw documents, use an intermediate
LLM call to summarize the documents specifically regarding the user's query.
3. Isolate (Sub-Agents): If a task is complex, spin up a sub-agent with a fresh, empty
context window containing only the relevant compressed data. This prevents "Context
Pollution" from previous, unrelated turns.
5.3 JSON Schemas as Input Context
In 2025, JSON Schemas are the lingua franca of Context Engineering. They are used not just
to format outputs, but to define the agent's understanding of the world.
24
The "Cognitive Rail" Effect:
When an agent is provided with a strict JSON schema for a tool or a memory object, it
constrains the model's reasoning space.
● Example: Defining a UserProfile schema with an enum for expertise_level: ["novice",
"intermediate", "expert"] forces the model to categorize the user, whereas a free-text
system prompt ("Remember how skilled the user is") leaves room for ambiguity.
Code Example: Memory Schema
JSON
{
"name": "User",
"description": "Update this document to maintain up-to-date information...",
"parameters": {
"type": "object",
"properties": {
"technical_skill": {"type": "string", "enum": ["low", "high"]},
"preferred_language": {"type": "string"}
}
}
}
Injecting this schema into the system prompt tells the model what is important to remember,
acting as a filter for attention.
26
6. Agentic Architecture: The 12-Factor Agent
As AI development matures from scripting to software engineering, the 12-Factor Agent
framework (popularized by HumanLayer in late 2025) has emerged as the industry standard
for building reliable agents.
5 This framework adapts the classic 12-Factor App methodology to
the probabilistic nature of LLMs.
6.1 Factor 5: Unify Execution State and Business State
One of the most critical insights of late 2025 is that agents should not have private
memory.
● The Anti-Pattern: The agent maintains a Python list messages = in memory. If the server
restarts, the agent develops amnesia.
● The 12-Factor Way: The agent's state is the business state. Every action the agent takes
(e.g., "Plan Created", "Code Written") should be a transaction in the application's
database. The context window is merely a projection or view of this database state at a
specific point in time.
● Benefit: This allows for "Time Travel" debugging. Developers can replay an agent's
thought process by simply reloading the database state from a previous timestamp.
5
6.2 Factor 12: The Stateless Reducer
This factor defines the architectural topology of the agent. An agent should be a pure
function (or as close to one as possible).
The Equation: NewState = Agent(CurrentState, Event)
● Mechanism: The agent receives the current state (context) and an event (user message).
It processes this through the LLM. It outputs a new state (or a set of actions/tool calls). It
does not retain any information internally between these calls.
● Implication: This enables horizontal scaling. Any worker node can pick up the next step
of an agent's execution because all necessary context is provided in the input payload. It
also solves the "Infinite Loop" problem; if an agent gets stuck, you can simply kill the
process and restart it from the last valid state without data loss.
4
6.3 Factor 4: Tools are Structured Outputs
In the 12-Factor view, "Tool Use" is not a magical capability; it is simply Structured Output
Generation.
● Demystification: When we say "The agent calls the Weather Tool," what actually
happens is:
1. The Agent outputs JSON: {"tool": "weather", "city": "London"}.
2. The Runtime (a deterministic script) parses this JSON.
3. The Runtime calls the API.
4. The Runtime feeds the result back to the Agent.
● Engineering Focus: This shifts the focus from "teaching the model to use tools" to
"defining robust JSON schemas." If the schema is rigorous, the tool use will be reliable.
29
7. Automated Optimization: DSPy & MIPROv2
By late 2025, manual "Prompt Engineering"—sitting in a playground and tweaking words—is
considered a legacy practice, akin to writing assembly code. The modern approach is Prompt
Compilation using frameworks like DSPy (Declarative Self-improving Python).
30
7.1 The Compilation Paradigm
DSPy separates the Logic (the flow of the program) from the Parameters (the prompts and
weights).
● Program: Context -> QA_Module -> Answer
● Compiler: The optimizer that figures out the best prompt for QA_Module.
7.2 MIPROv2: The State of the Art
Released in mid-2025 and refined through November, MIPROv2 (Multi-prompt Instruction
Proposal Optimizer v2) is the most advanced optimizer available.
32
How It Works:
1. Proposal: MIPROv2 looks at your data and your task. It uses a "Teacher Model" (e.g.,
GPT-5.1) to propose 10-20 different styles of instructions (e.g., "Be analytical," "Be
creative," "Think step-by-step").
2. Bootstrapping: It generates synthetic few-shot examples that demonstrate the task
perfectly.
3. Search: It runs a Bayesian search to find the optimal combination of that maximizes your
defined metric (e.g., accuracy, code correctness).
Impact:
Benchmarks from late 2025 show that MIPROv2 can take a generic prompt (e.g., "Write a SQL
query") and optimize it to outperform expert-written prompts by 20-30%, simply by finding
the specific "trigger words" and examples that resonate with the specific model architecture
being used.34
7.3 Code Example: Optimization Pipeline
Python
# 1. Define the Module (Logic)
class SQLGenerator(dspy.Module):
def __init__(self):
self.generate = dspy.ChainOfThought("question -> sql")
def forward(self, question):
return self.generate(question=question)
# 2. Define the Metric (Evaluation)
def validate_sql(example, pred, trace=None):
return is_valid_syntax(pred.sql) and executes_correctly(pred.sql)
# 3. Compile (Optimize)
teleprompter = dspy.MIPROv2(metric=validate_sql, auto="light")
optimized_agent = teleprompter.compile(SQLGenerator(), trainset=dataset)
In this workflow, the engineer never writes the prompt. They define the goal (the metric), and
the system discovers the prompt.
33
8. Security: Adversarial Robustness in 2025
The rise of reasoning models has introduced new attack vectors. The most prominent threat in
late 2025 is "Deceptive Delight".
36
8.1 Deceptive Delight & Multi-Turn Jailbreaks
Attackers have learned that models like GPT-5.1 and Claude 4.5 have "contextual attention." If
an attacker builds a long context of benign, helpful interactions (the "Delight" phase), the
model enters a compliant state. The attacker then slips in a harmful query (e.g., "How do I
bypass this firewall?"). The model, biased by the previous 20 turns of helpfulness, often
ignores its safety training to maintain consistency with the persona it has adopted.
8.2 Defense: Context Isolation & Output Validation
Context Isolation:
Security-critical agents should use the Stateless Reducer pattern to reset their "compliance
bias" periodically. By clearing the transient context or summarizing it strictly, the "Delight"
accumulation is broken.
Structured Output as Defense:
Forcing the model to output JSON (e.g., {"action": "...", "risk_assessment": "..."}) forces it to
process the request through a structured lens, which often re-triggers safety filters that might
be bypassed in free-text generation. The act of classifying the risk explicitly
("risk_assessment": "HIGH") often causes the model to self-censor.25
9. Conclusion: The AI Systems Architect
The transition from August to November 2025 has been transformative. We have moved from:
● Prompts to Context Architectures.
● Chatbots to 12-Factor Agents.
● Manual Tuning to DSPy Compilation.
● Text Output to Structured Actions.
The "Prompt Engineer" of 2024 is extinct. They have been replaced by the AI Systems
Architect—a professional who understands the token economics of Claude 4.5, the
steerability of GPT-5.1, the constraints of Gemini 3 Vibe Coding, and the rigorous state
management of Agentic workflows.
Success in 2026 will not depend on who can write the cleverest sentence, but on who can
design the most robust system for managing the flow of information through the cognitive
engines of the future.
Detailed Technical Appendices
Appendix A: GPT-5.1 Steerability Cheat Sheet
Tag Purpose Best Practice Example
<solution_persistence> Prevents premature
stopping in agentic loops.
"Treat yourself as an
autonomous senior
pair-programmer. Do not
ask for permission if the
path is clear."
<output_verbosity_spec> Controls "chatter" in
API/CLI outputs.
"Respond in Markdown.
Max 2 sentences. No
pleasantries."
<user_updates_spec> Manages user-facing
updates during long
reasoning.
"Post an update every 6
tool calls. Summarize
progress, do not list every
HTTP request."
<user_update_immediacy> Reduces perceived latency. "Explain what you are doing
FIRST, before entering the
thinking block."
8
Appendix B: Claude 4.5 Effort Economics
Effort Setting Cost Multiplier
(Est.)
Token Usage Recommended
For
low 0.5x Minimal Routing,
Categorization,
JSON Extraction.
medium 1.0x Standard Chat, Email,
Summarization.
high 2.0x - 5.0x High Coding
(Refactoring), Legal
Review, Complex
Math.
9
Appendix C: The Vibe Coding Prompt Structure
(Gemini 3)
Role
You are a Staff Engineer. Vibe: Pragmatic, Dry, Efficient.
Product Brief
● Create a dashboard for monitoring API latency.
● Real-time websocket data.
● Dark mode only.
Tech Rails (Strict)
● Next.js 15 (App Router)
● Shadcn UI (Radix primitives)
● Recharts for visualization
● Tailwind CSS
Design Tokens
● Background: #0a0a0a
● Accent: #3b82f6
● Font: Inter
Output Constraints
● No explanations.
● Return full file contents for new files.
● Return git diffs for edits.
16
Appendix D: 12-Factor Agent Summary
1. Natural Language to Tool Calls: The core interface.
2. Own Your Prompts: Don't rely on framework defaults.
3. Own Your Context Window: Explicit management (Select/Compress).
4. Tools are Structured Outputs: Rigorous JSON schemas.
5. Unify Execution & Business State: No private memory.
6. Launch/Pause/Resume: Simple APIs via stateless design.
7. Contact Humans via Tools: Explicit escalation paths.
8. Own Your Control Flow: Code drives the loop, not the LLM.
9. Compact Errors: Summarize stack traces before feeding back.
10. Small, Focused Agents: Single responsibility principle.
11. Trigger from Anywhere: Webhooks, cron, events.
12. Stateless Reducer: f(state, event) -> state.
5
Citerede værker
1. GPT-5.1: A smarter, more conversational ChatGPT - OpenAI, tilgået november 26,
2025, https://openai.com/index/gpt-5-1/
2. Claude Developer Platform - Claude Docs, tilgået november 26, 2025,
https://platform.claude.com/docs/en/release-notes/overview
3. A new era of intelligence with Gemini 3 - Google Blog, tilgået november 26, 2025,
https://blog.google/products/gemini/gemini-3/
4. The 12-Factor Agent, Factor 12: Make your agent a stateless reducer - Medium,
tilgået november 26, 2025,
https://medium.com/@krish777/the-12-factor-agent-factor-12-make-your-agent-
a-stateless-reducer-93e388acae08
5. humanlayer/12-factor-agents: What are the principles we can use to build
LLM-powered software that is actually good enough to put in the hands of
production customers? - GitHub, tilgået november 26, 2025,
https://github.com/humanlayer/12-factor-agents
6. GPT-5 - Wikipedia, tilgået november 26, 2025, https://en.wikipedia.org/wiki/GPT-5
7. ChatGPT — Release Notes - OpenAI Help Center, tilgået november 26, 2025,
https://help.openai.com/en/articles/6825453-chatgpt-release-notes
8. GPT-5.1 Prompting Guide - OpenAI Cookbook, tilgået november 26, 2025,
https://cookbook.openai.com/examples/gpt-5/gpt-5-1_prompting_guide
9. Introducing Claude Opus 4.5, tilgået november 26, 2025,
https://www.anthropic.com/news/claude-opus-4-5
10. How to Use Claude Opus 4.5 API - CometAPI - All AI Models in One API, tilgået
november 26, 2025,
https://www.cometapi.com/how-to-use-claude-opus-4-5-api/
11. What's new in Claude 4.5, tilgået november 26, 2025,
https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-
5
12. Effort - Claude Docs, tilgået november 26, 2025,
https://platform.claude.com/docs/en/build-with-claude/effort
13. Prompting best practices - Claude Docs, tilgået november 26, 2025,
https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claud
e-4-best-practices
14. Claude Sonnet 4.5 System Prompt : r/ClaudeAI - Reddit, tilgået november 26,
2025,
https://www.reddit.com/r/ClaudeAI/comments/1p6ywl6/claude_sonnet_45_syste
m_prompt/
15. Vibe Coding Explained: Tools and Guides - Google Cloud, tilgået november 26,
2025, https://cloud.google.com/discover/what-is-vibe-coding
16. Gemini 3 Vibe Coding Guide: Build Apps Without Technical Prompts (2025) -
Skywork.ai, tilgået november 26, 2025,
https://skywork.ai/blog/ai-agent/gemini-3-vibe-coding/
17. [Case Study] "Vibe Coding" vs. "Architectural Prompting": How to force Gemini 3
Pro to write production-ready BEM code in Google Antigravity :
r/PromptEngineering - Reddit, tilgået november 26, 2025,
https://www.reddit.com/r/PromptEngineering/comments/1p3s2bi/case_study_vibe
_coding_vs_architectural_prompting/
18. Gemini 3 for developers: New reasoning, agentic capabilities - Google Blog,
tilgået november 26, 2025,
https://blog.google/technology/developers/gemini-3-developers/
19. Gemini 3 API Guide: How To Use Google's Most Intelligent Model - AI Tools,
tilgået november 26, 2025, https://www.godofprompt.ai/blog/gemini-3-api-guide
20. Prompt design strategies | Gemini API | Google AI for Developers, tilgået
november 26, 2025, https://ai.google.dev/gemini-api/docs/prompting-strategies
21. Context Engineering for AI Agents & Langchain | by DhanushKumar | Nov, 2025,
tilgået november 26, 2025,
https://medium.com/@danushidk507/context-engineering-for-ai-agents-e00c3e
453837
22. Context Engineering - LangChain Blog, tilgået november 26, 2025,
https://blog.langchain.com/context-engineering-for-agents/
23. Context Engineering is the #1 Skill in 2025 | by Adithya Thatipalli | Medium, tilgået
november 26, 2025,
https://adithyathatipalli.medium.com/context-engineering-is-the-1-skill-in-2025-b
7b66444467b
24. How JSON Schema Works for LLM Tools & Structured Outputs - PromptLayer
Blog, tilgået november 26, 2025,
https://blog.promptlayer.com/how-json-schema-works-for-structured-outputs-a
nd-tool-integration/
25. Structured Output Generation in LLMs: JSON Schema and Grammar-Based
Decoding | by Emre Karatas | Medium, tilgået november 26, 2025,
https://medium.com/@emrekaratas-ai/structured-output-generation-in-llms-json
-schema-and-grammar-based-decoding-6a5c58b698a6
26. langchain-ai/memory-template - GitHub, tilgået november 26, 2025,
https://github.com/langchain-ai/memory-template
27. Context Engineering for Reliable AI Agents | 2025 Guide - Kubiya, tilgået
november 26, 2025, https://www.kubiya.ai/blog/context-engineering-ai-agents
28. LangChain Evolution Part 4: The 12-Factor Agent Methodology - Pedro Alonso,
tilgået november 26, 2025,
https://www.pedroalonso.net/blog/langchain-evolution-part-4
29. The 12-Factor Agent: A Practical Framework for Building Production AI Systems,
tilgået november 26, 2025,
https://dev.to/bredmond1019/the-12-factor-agent-a-practical-framework-for-bui
lding-production-ai-systems-3oo8
30. Automated Prompt Engineering with DSPy | Prompt Optimization for Financial
News Semantic Analysis, tilgået november 26, 2025,
https://www.youtube.com/watch?v=VN5yseWStX4
31. DSPy Tutorial 2025: Build Better AI Systems with Automated Prompt Optimization,
tilgået november 26, 2025,
https://www.pondhouse-data.com/blog/dspy-build-better-ai-systems-with-auto
mated-prompt-optimization
32. Prompt Optimization with DSPy: GEPA Explained with Python Examples, tilgået
november 26, 2025,
https://medium.com/@melikedulkadir/prompt-optimization-with-dspy-gepa-expl
ained-with-python-examples-e85f4ea17a8d
33. Automatic Instruction Optimization with DSPy | CodeSignal Learn, tilgået
november 26, 2025,
https://codesignal.com/learn/courses/how-to-optimize-with-dspy/lessons/autom
atic-instruction-optimization-with-dspy
34. I Studied 1500 Academic Papers on Prompt Engineering. Here's Why Everything
You Know Is Wrong. - Aakash Gupta, tilgået november 26, 2025,
https://aakashgupta.medium.com/i-studied-1-500-academic-papers-on-prompt
-engineering-heres-why-everything-you-know-is-wrong-391838b33468
35. DSPy, tilgået november 26, 2025, https://dspy.ai/
36. Deceptive Delight: Jailbreak LLMs Through Camouflage and Distraction, tilgået
november 26, 2025,
https://unit42.paloaltonetworks.com/jailbreak-llms-through-camouflage-distracti
on/
