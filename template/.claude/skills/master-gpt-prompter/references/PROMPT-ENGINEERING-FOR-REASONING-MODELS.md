**PROMPT ENGINEERING FOR REASONING MODELS**

**Prompt Engineering for Reasoning Models: The Definitive 2025 Guide**

**The rules have changed.** Everything you knew about prompting GPT-4 and Claude 3.5 may actively hurt your results with the new generation of reasoning models. Since August 2025, OpenAI's GPT-5, Anthropic's Claude 4 series, Google's Gemini 3, and DeepSeek's R1 have fundamentally transformed how we should craft prompts. These models think internally before responding---and asking them to "think step by step" often degrades their performance by **16% or more**.

This guide synthesizes the latest research from academic papers, official documentation, and practitioner insights to give you concrete, actionable strategies for every major reasoning model released since August 2025.

* * * * *

**The paradigm shift: why old prompting techniques backfire**

Traditional prompt engineering evolved around models that processed inputs linearly without genuine reasoning capabilities. Techniques like few-shot prompting, explicit chain-of-thought instructions, and verbose system prompts helped older models understand patterns and expected outputs. Reasoning models are architecturally different---they generate internal chains of thought before producing responses, effectively doing the "thinking" work that prompts previously had to induce.

Research from the University of the Free State published in October 2025 evaluated four prompting strategies across multiple reasoning models and found that **zero-shot prompting consistently outperformed few-shot approaches** for inferential tasks. Microsoft's MedPrompt research demonstrated that adding five or more examples to prompts for reasoning models degraded accuracy by over 16%. The models' internal thought processes become confused when examples suggest alternative reasoning paths.

OpenAI's official documentation now explicitly states: "Do NOT ask reasoning models to reason more. Explicitly prompting them to 'think step by step' may hurt performance." This represents a complete reversal from GPT-3.5 and GPT-4 best practices.

The PREMISE framework published in June 2025 demonstrated that proper prompt optimization can reduce reasoning token usage by **87.5%** while maintaining accuracy---translating to **69-82% cost reductions**. This efficiency gain comes specifically from removing the verbose instructions that worked for previous generations.

* * * * *

**Model-specific strategies for GPT-5 and GPT-5.1**

OpenAI released GPT-5 on August 7, 2025, introducing an architecture that routes between fast and deep thinking modes automatically. The model includes a **400K token context window** and **128K output token capacity**, with built-in reasoning that produces approximately 80% fewer hallucinations than the o3 model.

**Prompting GPT-5 effectively**

The cardinal rule for GPT-5 is **contradiction avoidance**. The model's internal router interprets every word and formatting choice to determine computational pathways. Conflicting instructions waste reasoning tokens and measurably reduce output quality. Where GPT-4 might tolerate "Be concise but thorough," GPT-5 will struggle to route appropriately.

The optimal prompt structure uses XML tags for clear delineation:

<context>

You are analyzing quarterly earnings reports for tech companies.

The user has access to SEC filings from 2024-2025.

</context>

<task>

Identify the three most significant revenue drivers for Company X

based on their Q3 2025 10-Q filing.

</task>

<constraints>

- Output format: Numbered list with brief explanations

- Maximum length: 500 words

- Cite specific figures from the filing

</constraints>

GPT-5 introduces two distinct control parameters. The **reasoning_effort** parameter accepts values of minimal, low, medium, or high and controls how deeply the model explores solution spaces. The **verbosity** parameter operates independently, controlling output length without affecting reasoning depth. This separation allows you to request thorough internal analysis while keeping responses concise.

For agentic tasks, GPT-5 excels with the "wide net" approach---gathering information from multiple sources simultaneously before synthesizing. The official OpenAI Cookbook recommends:

<context_gathering>

Goal: Get enough context fast. Parallelize discovery and stop as soon as you can act.

Method:

- Start broad, then fan out to focused subqueries

- In parallel, launch varied queries; read top hits per query

- Avoid over-searching for context

</context_gathering>

<persistence>

You are an agent---keep going until the user's query is completely resolved.

Only terminate when you are sure the problem is solved.

</persistence>

**Avoiding GPT-5 pitfalls**

A counterintuitive finding: GPT-5's automatic router can underperform for simple tasks. When prompts appear too straightforward, the model routes to faster, less capable pathways. For tasks requiring precision despite apparent simplicity, add explicit complexity signals or task framing that communicates the need for deeper analysis.

Remove instructions that older models needed but GPT-5 handles natively. The instruction "maximize thoroughness" is redundant---GPT-5 is inherently introspective. Similarly, explicit step-by-step guidance interferes with the model's optimized internal reasoning.

* * * * *

**OpenAI o3 series: when deep sequential thinking wins**

While GPT-5 uses a "wide net" approach, the o3 series (o3, o3-mini, o3-pro, and the newer o4-mini) follows a "goes deep" paradigm---narrow focus with sequential chain-of-reasoning. Released between January and June 2025, these models expose their reasoning process (in summarized form) and offer three explicit reasoning effort levels.

**Choosing between GPT-5 and o3**

The distinction matters for practical applications. Use **GPT-5** when you need parallel information gathering, tool integration including image generation, or real-time applications where latency matters. Use **o3-pro** for structured analysis, legal reasoning, scientific problems, or any task where you want deterministic, verifiable reasoning chains.

Benchmark performance illuminates these differences: GPT-5 achieves **74.9%** on SWE-bench Verified for end-to-end coding, while o3-pro excels on GPQA Diamond (graduate-level reasoning) at **87.5%**. For the AIME 2025 mathematics competition, o3 reaches **98.4%** while GPT-5 with tools achieves **100%**.

**o3 prompting essentials**

The o3 series requires explicit stop conditions for agentic tasks---without them, the model may continue reasoning indefinitely. Use developer messages (which replaced system messages) to set role, tone, and action boundaries:

Developer message:

Role: Legal contract analyst

Tone: Formal, precise

Actions: Identify risks, flag ambiguities, recommend revisions

Stop condition: Analysis complete when all clauses reviewed

User message:

Analyze this service agreement for liability exposure.

[Contract text]

A viral technique from prompt engineer Matt Shumer forces o3 into extended thinking:

Ultra-deep thinking mode. Greater rigor, attention to detail, and multi-angle verification.

Start by outlining the task and breaking down the problem into subtasks.

For each subtask, explore multiple perspectives, even those that seem initially irrelevant.

Deliberately seek out at least twice as many verification tools or methods as you think necessary.

Force yourself to reconsider the entire reasoning chain one final time from scratch.

**o3 function calling and tools**

The o3 series supports up to approximately 100 tools with up to 20 arguments per tool as "in-distribution" behavior. For function calling, add explicit hallucination mitigation:

Do NOT promise to call a function later. If a function call is required, emit it now;

otherwise respond normally.

One quirk: Markdown formatting is disabled by default in the o3 API. Add "Formatting re-enabled" as the first line of your developer message to restore standard formatting.

* * * * *

**Claude 4 series: precision instruction following**

Anthropic released Claude Opus 4 and Claude Sonnet 4 in May 2025, followed by Claude Sonnet 4.5 in September 2025 and Claude Opus 4.1 in August 2025. These models introduced "extended thinking" capabilities and a philosophical shift toward **ultra-precise instruction following**.

**The critical Claude 4 insight**

Previous Claude models were trained to go "above and beyond"---inferring what users wanted and adding helpful context unprompted. Claude 4 reverses this pattern. The models follow instructions with extreme precision, which means you must **explicitly request elaborate behavior**:

Create an analytics dashboard. Include as many relevant features and

interactions as possible. Go beyond the basics to create a fully-featured

implementation. Consider edge cases proactively without asking for clarification.

Without the explicit "go beyond" instruction, Claude 4 delivers exactly what was asked---no more, no less. This behavior surprised many users migrating from Claude 3.5.

**Extended thinking and "ultrathink"**

Claude 4 models support extended thinking modes with configurable token budgets. A discovery that went viral on Twitter in June 2025 revealed that specific trigger words control Claude Code's thinking budget:

|

**Trigger Word**

 |

**Token Budget**

 |
| --- | --- |
|

"think"

 |

4,000 tokens

 |
|

"think hard"

 |

More tokens

 |
|

"think harder"

 |

Even more

 |
|

"megathink"

 |

10,000 tokens

 |
|

"ultrathink"

 |

31,999 tokens (maximum)

 |

An Anthropic engineer confirmed the best practice: "First tell Claude about your task and let it gather context. Then, ask it to 'think' to create a plan. Claude will think more based on the words you use."

For extended thinking with tool use, prompt Claude to reflect after receiving results:

After receiving tool results, carefully reflect on their quality and determine

optimal next steps before proceeding. Use your thinking to plan and iterate

based on this new information, then take the best next action.

**Claude 4 formatting and style**

XML tags remain highly effective for Claude, continuing from earlier versions:

<use_parallel_tool_calls>

If you intend to call multiple tools and there are no dependencies,

make all independent calls in parallel.

</use_parallel_tool_calls>

<output_format>

Structure your response as:

1. Executive summary (2-3 sentences)

2\. Detailed findings (bullet points)

3. Recommendations (numbered list)

</output_format>

A critical behavioral note: Claude 4 models are more sensitive to system prompt language than predecessors. Where you might have written "CRITICAL: You MUST use this tool when..." for Claude 3.5, Claude 4 responds better to calibrated language: "Use this tool when..."

For Claude Opus 4.5 specifically, when extended thinking is disabled, **avoid the word "think"** in your prompts---it triggers unexpected behaviors. Substitute "consider," "evaluate," or "analyze."

* * * * *

**Gemini 3: multimodal reasoning at scale**

Google released Gemini 3 on November 18, 2025, achieving a record **1501 Elo score** on LMArena and claiming state-of-the-art multimodal understanding. The model features a **1M+ token context window** and introduces "Deep Think" mode for enhanced reasoning.

**Temperature is critical for Gemini 3**

Google's official documentation delivers an emphatic warning: **Keep temperature at the default 1.0**. Reducing temperature below 1.0 can cause unexpected looping behavior and degraded performance on mathematical and reasoning tasks---the exact opposite of intuition from earlier models.

The **thinking_level** parameter controls reasoning depth:

-   **low**: Minimizes latency and cost; best for simple instruction following and high-throughput applications
-   **high** (default): Maximizes reasoning depth with longer time to first token

**Prompting philosophy differences**

Gemini 3 is designed to infer intent better than any previous Google model. The official guidance states it's "much better at figuring out the context and intent behind your request, so you get what you need with less prompting." Complex prompt engineering techniques that worked for older models can actually hurt Gemini 3 performance by causing over-analysis.

For structure, choose XML tags OR Markdown---not both. Mixing formats degrades consistency:

<role>

You are Gemini 3, a specialized assistant for financial analysis.

You are precise, analytical, and persistent.

</role>

<instructions>

1\. Plan: Analyze the request and create a step-by-step approach

2\. Execute: Carry out the plan; if using tools, reflect before every call

3. Validate: Review output against the user's task

4\. Format: Present in the requested structure

</instructions>

<error_handling>

IF context is empty or lacks necessary data:

- DO NOT attempt to generate a solution

- DO NOT make up data

- Output a polite request for missing information

</error_handling>

**Thought signatures for function calling**

Gemini 3 generates encrypted "Thought Signatures" representing internal reasoning. For function calling, you **must return these signatures exactly as received**---missing signatures result in 400 errors. For text and chat applications, omitting signatures degrades reasoning quality even when responses appear normal.

**Multimodal input handling**

Gemini 3 treats text, images, audio, and video as equal-class inputs. Use the **media_resolution** parameter to optimize token usage:

-   Images: media_resolution_high (1120 tokens)
-   PDFs: media_resolution_medium (560 tokens)
-   Video (general): media_resolution_low (70 tokens/frame)
-   Video (text-heavy): media_resolution_high (280 tokens/frame)

For multimodal reasoning tasks, place specific instructions and questions **at the end** of prompts, after the data context. Use anchor phrases like "Based on the information above..." to direct attention.

* * * * *

**DeepSeek R1: transparent reasoning on a budget**

DeepSeek released R1 in January 2025, offering a 671B parameter Mixture-of-Experts model with 37B active parameters per token. At approximately **$0.14 per million input tokens** (cache hit) and **$2.19 per million output tokens**, R1 provides reasoning capabilities at a fraction of competitor costs---roughly 90% cheaper than comparable models.

**R1's unique prompting requirements**

DeepSeek's official recommendation is stark: **no system prompt**. All instructions should go in the user prompt. The model also performs better with **no few-shot examples** and no explicit chain-of-thought prompting.

Temperature setting is critical---the model can enter infinite repetition loops without proper configuration. DeepSeek recommends **temperature 0.6** with **top-p 0.95**.

R1 uses a structured output format with visible reasoning:

<think>

[Internal reasoning process - visible to users]

</think>

<answer>

[Final answer]

</answer>

For mathematical tasks, include the directive: "Please reason step by step, and put your final answer within \boxed{}"

**Handling R1's transparency**

Unlike OpenAI and Anthropic models that hide their reasoning, R1 exposes complete chain-of-thought traces. This transparency has a tradeoff: responses tend to be more verbose and slower. The visible reasoning is valuable for debugging and understanding model behavior but can be excessive for production applications.

One documented issue: R1 occasionally identifies the correct answer in its thinking trace but outputs an incorrect final answer. For critical applications, implement majority voting across multiple generations.

If R1 produces repetitive or incoherent output, check temperature settings first, then move any system prompt content into the user prompt.

**7. Advanced Meta-Prompting Frameworks**

Beyond model-specific quirks, late 2025 has seen the maturation of several universal "Meta-Prompting" frameworks. These are high-level architectural patterns that structure the interaction to extract maximum performance from any reasoning model.

**7.1 Skeleton-of-Thought (SoT)**

SoT is a technique designed to reduce latency and improve structure in long-form generation.Â It mimics the human writing process of outlining before drafting.Â Â Â 

-   **Mechanism:**Â The process involves two parallel API calls.

1.  **Skeleton Stage:**The prompt instructs the model to "Provide a skeleton in a numbered list (1., 2., 3...) to answer the question. Each point should be very short (3-5 words)."
2.  **Expansion Stage:**The system then prompts the model to "Write a 1-2 sentence expansion for point {index} of the skeleton." This can be done in parallel for maximum speed.

-   **Application:**Â This framework is ideal for generating comprehensive reports, summaries, or strategic plans where structure and speed are paramount. It prevents the model from "rambling" and ensures every part of the topic is covered.Â Â Â 

**7.2 Chain-of-Table (Tab-CoT)**

Standard Chain-of-Thought reasoning often struggles with tabular data or complex multi-variable correlations. Tab-CoT addresses this by forcing the model to reason within a structured 2D format.Â Â Â 

-   **Mechanism:**Â The prompt commands the model to "Generate your reasoning in a table format with the following columns:Â | Step | Subquestion | Process | Result |."
-   **Why It Works:**Â By forcing the model to align its logic in rows and columns, Tab-CoT compels it to be rigorous. TheÂ ProcessÂ column requires explicit calculations, while theÂ ResultÂ column isolates the intermediate answer. This structure allows the model (and the user) to "debug" the reasoning process row by row, leading to significantly higher accuracy on tasks like financial analysis or data transformation.Â Â Â 

**7.3 Recursive Criticism and Improvement (RCI)**

RCI is a "self-healing" prompting protocol that leverages the model's ability to critique its own work. It is particularly effective for coding and logic tasks where the first attempt often contains subtle errors.Â Â Â 

-   **Mechanism:**Â The prompt sets up an iterative loop:

1.  **Generate:**Â "Create an initial draft of the solution."
2.  **Critique:**Â "Critically evaluate your previous output. Identify at least 3 specific weaknesses, logical gaps, or efficiency problems."
3.  **Improve:**Â "Create a refined version of the solution that addresses these specific weaknesses."

-   **Impact:**Â Research shows that this simple recursive loop can boost performance on reasoning benchmarks by double-digit percentages. It forces the model to switch from "generation mode" (System 1) to "evaluation mode" (System 2) and back, refining the output with each pass.Â Â Â 

**7.4 Recursion of Thought (RoT)**

For problems that exceed the cognitive capacity of a single context window---such as writing a full novel or architecting a massive software system---RoT provides a "divide and conquer" strategy.Â Â Â 

-   **Mechanism:**Â Instead of asking the model to solve the whole problem, the prompt asks it to "Decompose this problem into independent sub-problems that can be solved in isolation."
-   **Execution:**Â Each sub-problem is then solved in a separate context window (potentially using different agents or models), and the results are aggregated. This overcomes the "context limit" not by extending the window, but by modularizing the reasoning process.

**Control the Depth of Reasoning and Verbosity**

One major difference with these reasoning models is their ability to adjust how much "thinking" they do. As a prompter, you have a couple of ways to influence this:Â **through instructions**Â or, in some models, via special parameters/settings.

By default,Â **O1/O3 (OpenAI's older reasoning models) and now GPT-5.1**Â areÂ *inclined to reason extensively*. They prioritize accuracy and completeness over brevity. For example, GPT-5.1's "Thinking" variant will deeply analyze a hard question internally -- which often yields correct, well-justified answers, but can also produce longer responses. On the other hand, GPT-5.1's "Instant" mode (or when using theÂ noneÂ reasoning setting) will produce faster, shorter answers by skipping internal chains-of-thought[medium.com](https://medium.com/@nanthakumar18122000/chatgpts-gpt-5-1-adaptive-reasoning-8-personalities-november-2025-adcf30a43db2#:~:text=ChatGPT%E2%80%99s%20GPT,more%20thorough%20on%20complex%20problems)[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=For%20teams%20coming%20from%20GPT,when%20this%20mode%20is%20enabled).Â **As the user, you can decide which style you want.**

If youÂ *want a detailed explanation or thorough analysis*, make that clear: e.g.Â *"Provide a detailed step-by-step explanation along with your answer."*Â The model won't shy away from giving a long answer if asked. For instance, you might say to Claude,Â *"Show all your reasoning steps clearly before the final answer."*Â Conversely, if the model's answers areÂ *too long or too technical*, instruct it to be concise:Â *"Give a brief answer in 2-3 sentences."*Â orÂ *"Summarize without extra detail."*Â This usually "overrides" the model's tendency to elaborate.

Notably,Â **OpenAI and Anthropic have introduced explicit controls for reasoning depth**. In GPT-5.1, there are now multipleÂ *reasoning modes*. TheÂ noneÂ mode (now the default for many cases)Â **forces the model to useÂ *zero*Â reasoning tokens**Â -- essentially telling it not to engage in lengthy internal monologues[cookbook.openai.com](https://cookbook.openai.com/examples/gpt-5/gpt-5-1_prompting_guide#:~:text=Using%20the%20%E2%80%9Cnone%E2%80%9D%20reasoning%20mode,for%20improved%20efficiency)[cookbook.openai.com](https://cookbook.openai.com/examples/gpt-5/gpt-5-1_prompting_guide#:~:text=more%20similar%20in%20usage%20to,With). This makes it behave more like older GPT-4 style models, giving quick answers. If a task truly doesn't require heavy reasoning (simple lookups, straightforward queries), this mode is efficient. However, if you still want careful reasoning on a tricky partÂ *while inÂ noneÂ mode*, you can explicitly prompt the model toÂ *"think carefully"*Â or plan before answering[cookbook.openai.com](https://cookbook.openai.com/examples/gpt-5/gpt-5-1_prompting_guide#:~:text=match%20at%20L366%20While%20GPT,to%20invoke%20can%20improve%20accuracy). In other words, even when we disable automatic deep reasoning, we can use natural language instructions to get the model to reason in a controlled way (perhaps by asking it to list pros/cons or outline its plan first).

Anthropic's Claude Opus 4.5 has something analogous: anÂ effort**Â parameter**Â that can be set toÂ *High, Medium,*Â orÂ *Low*[platform.claude.com](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5#:~:text=Effort%20parameter)[platform.claude.com](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5#:~:text=,volume%20automation). High effort means maximum thoroughness (more reasoning steps, more tokens), whereas Low effort yields concise responses suitable for high-volume queries. If you're using Claude via API, you can set this parameter. If not, you can mimic it in the prompt by instructions: for example,Â *"Do a comprehensive analysis"*Â hints at high effort, versusÂ *"Answer briefly and efficiently"*Â hints at low. Indeed, Anthropic notes that Opus 4.5 lets you trade offÂ *"response thoroughness and token efficiency"*Â with this single setting[platform.claude.com](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5#:~:text=Effort%20parameter). Use high for complex analysis, low for quick answers.

Other models:Â **Gemini 3**Â is reported to be by default concise and direct in its answers (preferring not to ramble)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=your%20prompts%20%28e,than%20analyzing%20them%20in%20isolation). So if you want more verbosity or a chattier style, youÂ *must ask for it*[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=your%20prompts%20%28e,than%20analyzing%20them%20in%20isolation). Similarly, if Gemini's upcomingÂ *Deep Think mode*Â is enabled, it will naturally produce a more elaborate solution -- but in normal operation, it tries to be efficient. WithÂ **Grok 4.1**, xAI actually provides two versions: the full reasoning mode (which topped some leaderboards) and a "Fast" mode thatÂ *"uses no thinking tokens for an immediate response"*[x.ai](https://x.ai/news/grok-4-1#:~:text=In%20LMArena%27s%20Text%20Arena%2C%20Grok,33). When using Grok, you might choose the version depending on your needs. If you have Grok Fast and still need depth on a particular query, instruct it accordingly (e.g. "analyze this thoroughly before final answer").

In summary,Â **be explicit about how exhaustive vs. brief**Â you want the model to be. These systems can do anything from a one-sentence answer to a multi-page dissertation. They will default to somewhere in the middle (often leaning detailed for complex tasks, or lean concise for simple ones). But a simple nudge from you can calibrate the level.

**Example instructions for verbosity control:**

-   *"Explain the solution in detail, as if teaching a beginner (include intermediate steps)."*Â -- This will prompt a very detailed, step-by-step explanation.
-   *"Just give me the final result with a one-sentence justification."*Â -- This ensures brevity, with only a touch of reasoning included.
-   *"Provide a bullet-point summary of your analysis, then a final conclusion."*Â -- This limits format and length (bullets encourage conciseness per point).
-   *"Think carefully and double-check each step, but only show the final answers, not the entire thought process."*Â -- This is an interesting one: it tells the model toÂ *internally*Â be thorough (especially useful with a model like O1/Claude that will heed that), but to keep the output lean. Models like O1/O3 would follow this by doing the heavy lifting unseen and giving you a verified answer. GPT-5.1 might not fully hide its reasoning unless it's inÂ noneÂ mode, but it would likely still focus on giving a confirmed answer with minimal explanation if instructed so.

Finally, note that if you're repeatedly finding the model either too verbose or not detailed enough, you should update yourÂ **system-level instructions**Â to encode this preference permanently. For example, you might include in the system message:Â *"Overall, keep responses concise and to-the-point unless asked for more detail."*Â or the opposite:Â *"When in doubt, err on the side of providing more explanation and context."*Â By making it a general principle in the prompt, you won't have to repeat it for every query.

**6. Leverage Structured Prompting (Delimiters and Sections)**

As prompts get larger -- especially with huge context windows now -- it's important toÂ **maintain structure in your prompt**Â so the model knows which part is which. A great technique is usingÂ **delimiters**Â like XML/JSON-style tags, Markdown headings, or other markers to separate different components of the prompt. This clarity prevents the model from mixing up instructions vs. data vs. questions.

For example, you might format a prompt like this:

<rules> 1. Be objective and factual. 2. Cite a source for any specific claim. </rules> <context> [Here you paste a document or data that the model should use.] </context> <question> Based on the <context> above, what are the main risk factors noted? </question>

The tagsÂ <rules>,Â <context>,Â <question>Â explicitly label each section. A model like Claude or GPT-5.1 will recognize that the content insideÂ <rules>Â is instructions it must follow, whereas the content insideÂ <context>Â is background information, andÂ <question>Â contains the actual user query. Anthropic's best practices encourage using suchÂ **section titles or XML-style tags**Â for clarity[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=careful%20reasoning%20through%20targeted%20prompts%2C,when%20this%20mode%20is%20enabled)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=Use%20XML,choose%20one%20format%20for%20consistency). In tests, this approach helps the modelÂ **"interpret different sections appropriately"**[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=careful%20reasoning%20through%20targeted%20prompts%2C,when%20this%20mode%20is%20enabled)Â -- in other words, it won't confuse a block of context text with something it should directly answer, if you clearly label it as reference data.

You can achieve a similar effect with Markdown: e.g., usingÂ ### ContextÂ andÂ ### User QuestionÂ as headings. The key is consistency -- don't mix too many notation styles in one prompt. Pick a scheme (XML-like tags, or markdown headings, or even something likeÂ -----) and use it uniformly so the model learns the pattern[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=Use%20XML,choose%20one%20format%20for%20consistency)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=Use%20XML,choose%20one%20format%20for%20consistency).

**Why is this important with long contexts?**Â Because with context windows of 200K+ tokens (as in Claude Sonnet 4.5) or 1M (Gemini 3), you might be inserting entire documents, codebases, or transcripts into the prompt. The model will dutifully read all that, but you want to ensure it knowsÂ *when that ends and your question begins*. Always sandwich large context data between clear delimiters, and thenÂ **place your actual instructions or query after the context block**. One recommended approach (noted by experienced users of Gemini 3) is to putÂ **specific instructions at the end of the prompt, after providing the data**, so they are freshest in the model's short-term attention[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=,before%20your%20question). For instance: "<context>Â [long text]Â </context>Â **Given the above, answer the following...**". This bridging phrase ("Given the above...") helps anchor the question to the provided information[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=,before%20your%20question). It reduces the chance of the model drifting or using outside knowledge, since you explicitly tied its focus to the context.

Another benefit of structured prompting is easier maintenance. If you are programmatically constructing prompts (common in retrieval-augmented generation, where you fetch relevant passages then insert them), having a template with placeholders likeÂ <context>Â andÂ <question>Â is very useful. It also allows the model to handle each part methodically -- some advanced models even internally note boundaries.

**Example -- Markdown structured prompt:**

# Identity You are a Python coding assistant. # Constraints - No external libraries, standard Python 3.11 only. - Explain your solution briefly, then show the corrected code. # Code Snippet ```python def add_unique(item, collection=[]): collection.append(item) return collection

**Task**

The above function has a bug (it behaves incorrectly on multiple calls). Explain the issue and provide a corrected version of the function.

*(Note: the triple backticks and markdown headings are part of the prompt structure here.)*

In this example, we have labeled sections: Identity (role), Constraints (rules like no external libs and output format expectations), Code Snippet (the context data we're giving), and Task (the actual user request). A reasoning model will parse this and understand it should take on the identity of a Python assistant, respect the constraints (so it won't use disallowed libraries and will produce code+explanation), focus on the given code, and then fulfill the task. Structuring the prompt this way makes it **crystal clear** what each part means. We're less likely to get an irrelevant or hallucinatory answer because the model's inputs were well-organized.

To summarize this point: **Use formatting to your advantage**. Delimit different parts of your prompt with tags or headings, especially when providing large contexts or multi-step instructions. This reduces ambiguity and helps the model follow your intent at each stage. It's like giving the model a formatted worksheet to fill out, rather than a jumbled paragraph of text -- the former leads to much more reliable outputs.

### 7. Provide Context -- But Only What's RelevantÂ 

Thanks to huge context windows, you can feed entire documents or multiple sources into models like GPT-5.1, Claude, or Gemini 3. This is great for analysis tasks (summaries, comparative reasoning, etc.). However, just because you *can* stuff everything in doesn't mean you *should*. **Focus on relevant context** to avoid cluttering the model's mind. If a prompt contains a lot of low-signal or irrelevant text, the model may start to miss important details or get confused:contentReference[oaicite:51]{index=51}. It might also waste its internal reasoning budget parsing things that don't matter.

**Best practice:** perform a relevance check or provide a summary of context if possible. For retrieval-Augmented Q&A, include only the top useful passages rather than an entire wiki. If you have a 100-page PDF but the question is about a specific section, isolate that section for the prompt. Anthropic's guide for Claude notes to *"include only the most relevant information"* when doing retrieval, to prevent the model from overcomplicating its response:contentReference[oaicite:52]{index=52}. Similarly, an internal tip from a developer says: if the model output starts missing details or going off track, it's likely because *"you're overfilling the window with low-signal text."* The remedy: *"reset with a clean prompt, and attach a **compact** state summary instead"*:contentReference[oaicite:53]{index=53}.

In other words, *quality of context beats quantity*. These models do have phenomenal memory, but they still prioritize what seems important. Don't bury them in noise.

That said, sometimes you truly need to supply a large volume of information (e.g., entire code files for a coding assistant to debug). In those cases, use the structuring advice above to clearly separate each file or section, perhaps giving each a label. And consider telling the model: *"The following context is lengthy, but you should focus on X part for answering the question."* This kind of pointer can help it locate the crucial info.

Also, if the context might contain **ambiguities or incomplete data**, call that out and instruct the model how to handle it (make an assumption or ask for clarification). Otherwise, the model might waste tokens pondering ambiguities. For example: *"All data may not be complete; if a critical piece is missing, assume a reasonable value and state that assumption."* This pairs with providing context because it acknowledges any gaps in that context and guides the model's reasoning around them.

Finally, **anchor the context to the query**. As mentioned, a bridging phrase like *"Based on the information above, [your question]?"* is very useful:contentReference[oaicite:54]{index=54}. It signals to the model that *"hey, use that info up there when answering this."* Without it, the model *likely* will anyway, but this reduces the chance of it drifting or introducing external info.

**Example -- using relevant context effectively:** Suppose you want an analysis of a company's financial health using their annual report. Instead of dumping the entire report in the prompt and asking "How is the company doing?", you might extract the financial summary section and key metrics, put them under a `<financial_data>` tag, and then ask a targeted question: *"Given the above financial data (revenue, profit, debt levels), evaluate the company's financial health and outlook."* This way, the model isn't distracted by the rest of the annual report (like descriptions of products or a letter from the CEO, which aren't directly relevant to financial health). You've given it exactly the numbers it needs and asked a focused question. The answer will be more accurate and on-point.

In summary: **feed the model with good information, not all information**. These reasoning models *will* diligently use whatever you give them, so make sure you give them something useful. Trim the fat, highlight the key facts, and your prompts will yield far better results. As a bonus, you save on token usage and latency by not overloading the context.

### 8. Encourage Reasoning Checks and AccuracyÂ 

One of the strengths of advanced reasoning models is their ability to **self-monitor and double-check** their work. GPT-5.1, for instance, can be prompted to reflect on a solution and catch mistakes (OpenAI's guide even covers a "metaprompting" technique where the model critiques its own output):contentReference[oaicite:55]{index=55}:contentReference[oaicite:56]{index=56}. You can tap into this by explicitly instructing the model to verify or justify its answer.

For critical or complex tasks, consider adding a prompt like: *"Before finalizing your answer, double-check that all steps are consistent and no facts contradict each other. If you find an error, correct it."* This tells the model to perform an internal consistency check. Models like O1/Claude have shown the ability to catch contradictions when asked, and GPT-5.1 has improved in calibrating its answers too. In fact, OpenAI notes that GPT-5.1 sometimes *errs on the side of conciseness at the cost of completeness*, so emphasizing *"persistence and completeness"* via prompting can help ensure it doesn't drop important details:contentReference[oaicite:57]{index=57}. For example, you might remind it: *"Make sure your answer addresses every part of the question thoroughly."*

Another approach is to have the model list **assumptions or uncertainties**. If the problem space is ambiguous (common in logic puzzles or real-world scenarios), prompt the model to enumerate any assumptions it's making. E.g.: *"If any information is unclear or missing, state your assumptions before proceeding."* A reasoning model will happily comply, saying something like "Assumption: The term X refers to Y since it's not specified." This not only makes the reasoning transparent but also can surface any misinterpretations early. GPT-5.1 and Claude both are quite good at flagging ambiguity when asked. By default, Claude tends to be cautious and might do this on its own; GPT-5.1's adaptive reasoning might plow ahead unless instructed to pause and reflect. So adding that instruction can make it more careful.

You can also instruct a **"chain-of-verification"** explicitly: e.g. *"After solving, briefly explain why your answer is correct or how you verified it."* This forces the model to either provide proof or reconsider if it can't justify something. It's similar to how one might prompt GPT-4 with "let's think step-by-step," except these new models are already doing the step-by-step internally. We are just asking them to *check their steps*.

In the context of tools or multi-step plans, OpenAI's GPT-5.1 guide suggests reinforcing this too -- for instance, telling the model to *"reflect on outcomes of function calls"* and adjust if needed:contentReference[oaicite:58]{index=58}. Concretely: *"Review the result of each tool/action and make sure it succeeded. Don't just assume it worked -- if something seems off, try another approach."* Including such guidance can prevent the model from racing to a conclusion without verifying intermediate steps.

Finally, a powerful technique is to **use the model in an iterative or ensemble manner**. If the task is extremely critical (medical advice, complex engineering calc, etc.), you can run multiple prompts and compare answers. Or ask the model: *"Is there an alternative interpretation or solution? If so, briefly describe it."* This pushes the model to consider if its first answer was truly the only answer. Often, the model might reveal a different angle or confirm that it's confident in the initial answer. With O1 we sometimes ran the same question twice (since it was non-deterministic) and cross-checked. With GPT-5.1, you could similarly set the temperature slightly higher and get two independent attempts, then have the model (or yourself) reconcile them. The models are not infallible, but they're getting better -- leveraging their own reasoning ability to self-criticize is one way to catch mistakes.

**Key point:** Don't assume the model will always do these checks unprompted (even though the reasoning models often do some). If accuracy is paramount, *explicitly ask for validation*. Even something as simple as, *"Are you confident in that answer? Double-check each step."* can make GPT-5.1 or Claude pause and re-evaluate. They might then correct themselves or state a level of confidence. In practice, users have found that telling GPT-5.1 to *"persist until fully solved and be biased toward action"* leads it to handle tasks without stopping prematurely:contentReference[oaicite:59]{index=59} -- similarly, telling it to *"be extra sure of your conclusion"* leads to a more careful final answer.

In sum, use the model's intelligence *on itself*. Encourage it to verify, list assumptions, and confirm the solution makes sense. This harnesses the "reasoning about reasoning" capability that these advanced models offer. It can significantly boost reliability, especially in complex multi-step problems where mistakes can creep in without notice.

### 9. Let the Model Solve Autonomously (for Agents & Tools)Â 

One of the biggest advancements with models like Claude 4.5, GPT-5.1, Gemini 3, and Grok 4.1 is their ability to function as **autonomous agents** -- meaning they can plan multiple steps and use tools or APIs in sequence to achieve a goal. To maximize this, your prompts should **encourage autonomy and persistence** in solving the task, rather than expecting the user to hold its hand each step of the way.

For instance, OpenAI's new guide for GPT-5.1 suggests using instructions like *"persist until the task is fully handled end-to-end within the current turn whenever feasible"* and *"be extremely biased for action"*:contentReference[oaicite:60]{index=60}. What does this mean? It means telling the model: *"Don't keep asking me for permission or clarification at each step -- just go ahead and do as much as you can to solve it."* In practical terms, if you're building an agent that, say, plans a trip and can use tools (flight search, hotel booking, etc.), you want the model to use those tools and come back with a complete result (a full itinerary), not stop after finding a flight and ask "Should I continue?".

**How to prompt for this:** Set expectations that the model **should continue working until the goal is achieved** or no further actions can be taken. You can include a directive like: *"You are an autonomous agent. Continue reasoning and using available tools until the user's query is completely resolved. Do not hand control back to the user until you have a final answer."*:contentReference[oaicite:61]{index=61}. Also, *"If an action fails, analyze why and try a different approach instead of giving up."*:contentReference[oaicite:62]{index=62}. These instructions push the model to be resilient and resourceful. (Of course, you must have safe-guards -- e.g., if truly stuck or if risk of error, it might eventually stop. But generally, err on the side of trying something else autonomously.)

When tools are involved, another good practice is to ask for a brief **plan before execution**. For example: *"First, draft a plan of which tools or steps you will take. Then execute the steps."* This can be done in a single prompt or interactively. GPT-5.1 in none-reasoning mode especially benefits from a nudge to plan function calls thoughtfully:contentReference[oaicite:63]{index=63}. Claude's new Agent SDK similarly likes having a game plan. You might see a conversation like: the model outputs *"Plan: 1) search for X, 2) summarize info, 3) answer user"* then it proceeds to tool calls. Some developers explicitly prompt: *"Before calling any tool, explain why you are calling it and what you expect to get."*:contentReference[oaicite:64]{index=64}. This "reflection before action" tends to improve tool use accuracy (the model is effectively double-checking its intention). It's similar to how human agents reason ("I will use the calculator to sum these numbers because...").

**Persistence directive example:**Â 

```text

You are an autonomous research assistant.

- Continue working step-by-step until the question is fully answered.Â 

- If a tool or query fails, analyze the error and try an alternative strategy.Â 

- Do **not** stop or ask the user for help unless you absolutely cannot proceed without clarification.Â 

- Verify each result you get, and only finalize the answer when confident it's complete.

With such an instruction, a model like Claude Sonnet 4.5 (with its extended "thinking" enabled) will potentially run for dozens of tool calls and iterations if needed, andÂ *keep the user out of the loop until done*. This is exactly what we want in many agent scenarios -- minimal back-and-forth, maximum independence. In fact, Anthropic's Claude has a feature calledÂ **"thinking block preservation"**Â which ensures it remembers its past chain-of-thought across turns[platform.claude.com](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5#:~:text=Thinking%20block%20preservation). That means you don't have to re-feed prior reasoning when it continues a task. But you should still encourage it to actuallyÂ *use*Â that ability by not interrupting unnecessarily. The prompt above does that by saying "don't ask me, just do it."

ForÂ **multi-turn interactions**, these models also have "context awareness" of how much of the window is left, etc. For example, Claude Sonnet will know how many tokens remain and avoid running out mid-task[platform.claude.com](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5#:~:text=been%20accomplished.%20,enables%20the%20model%20to%20effectively)[platform.claude.com](https://platform.claude.com/docs/en/about-claude/models/whats-new-claude-4-5#:~:text=,agentic%20search%20and%20coding%20workflows). You as the prompter can help by chunking tasks or explicitly telling it the time/iteration limits if any.

Lastly, if you haveÂ **specific tools**Â integrated (via function calling in OpenAI, or Claude's tools, or xAI's Agent Tools API), ensure your prompt lists the tools and their purpose clearly. For example:Â *"Available tools:Â search(query)Â -- searches the web;Â calculate(expr)Â -- computes math."*Â Then instruct:Â *"You may use these tools freely. Use them whenever they'll help solve the problem."*Â This upfront declaration is important so the model knows what it can do. And as mentioned, you can ask it to document its tool use plan or rationale, which helps with traceability.

**Summing up this point:**Â When using reasoning models as autonomous agents,Â **encourage them to take the wheel**. Provide a strong guiding prompt that they should complete tasks end-to-end, use tools smartly, and not constantly defer to the user. The 2025 models are much better at this than earlier ones, so a well-crafted prompt can unleash their full potential in automation. (Of course, always keep an eye on them in critical domains -- autonomy is great, but you want to verify the final outcomes as the developer/user.)

**Core Prompting Principles for Reasoning Models**

**1\. Keep Prompts Clear, Direct, and Focused**

All recent models respond best toÂ **concise, unambiguous instructions**. Provide a plain statement of the problem or task without fluff or extraneous commentary. For example,Â **Gemini 3**Â "favors directness over persuasion and logic over verbosity"[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=Gemini%203%20favors%20directness%20over,adhere%20to%20these%20core%20principles). In practice, this meansÂ **avoiding overly long or story-like prompts**Â that might distract the model. StateÂ *exactly*Â what you need in simple terms. If the task is a question, ask the question straightforwardly. If it's an instruction, give a direct command.

**Bad (too verbose):**Â *"In this challenging puzzle, I'd like you to carefully reason through each step to reach the correct solution. Let's break it down step by step... Here is the puzzle. I know it's tricky, but do your best."*

**Good (concise):**Â *"Solve the following puzzle and explain your reasoning step-by-step: [puzzle description]."*

The latter prompt wastes no tokens on apology or hype -- it plainly asks for a solution and explanation. These reasoning-optimized modelsÂ **don't need motivational phrases or role-play fluff**Â to trigger deep analysis; they will naturally engage in internal chain-of-thought given a clear problem. In fact, overly elaborate prompts canÂ *confuse or dilute*Â the focus. Research with earlier reasoning models like O1 showed that adding too much context or flowery language actuallyÂ **worsened performance by overwhelming the model's reasoning process**[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=Teams%20upgrading%20from%20GPT,reflects%20on%20its%20tool%20use). The same holds with GPT-5.1 and others today.

**Tip:**Â If your prompt is getting long or includes tangential details, ask yourself what can be removed. Keep only the information necessary to the task. Clarity and brevity help the model zero in on the core problem. As one expert summary put it:Â *precise instructions, defined terms, and no fluff yield the best results*[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=Gemini%203%20favors%20directness%20over,adhere%20to%20these%20core%20principles). Always prefer a straightforward prompt over a fancy one when it comes to reasoning tasks.

**2\. Use Zero-Shot Prompts First; Add Examples Only If Needed**

For earlier GPT-3/4 models, few-shot examples were a common way to "teach" the format or provide guidance. But the newest reasoning models are so capable thatÂ **they often excel with zero-shot prompts**, and adding example interactions can be unnecessary or even detrimental. OpenAI explicitly advises tryingÂ *zero-shot*Â prompting with GPT-5.1 before resorting to few-shot[medium.com](https://medium.com/@nanthakumar18122000/chatgpts-gpt-5-1-adaptive-reasoning-8-personalities-november-2025-adcf30a43db2#:~:text=ChatGPT%E2%80%99s%20GPT,more%20thorough%20on%20complex%20problems). Similarly, Anthropic found that O-series models didn't benefit from multiple examples -- extra demonstrations couldÂ *distract*Â their internal logic. The same trend continues in 2025: these models have been trained on rich datasets and can infer what you need from a single well-worded query.

**Implication:**Â Start by givingÂ *just the task or question itself*.Â **Don't preload**Â your prompt with half a dozen examples of Q&A or step-by-step solutions unless the model is misinterpreting the task without them. In many cases, you'll find the model handles the query correctly on the first try. For example, if asking a legal reasoning question,Â **do not prepend a full sample case analysis**Â as was sometimes done with GPT-4. Simply ask about the new case directly. If the model's first attempt isn't what you wanted, you can then iteratively add aÂ *small*Â amount of guidance (perhaps one example or a format hint). ButÂ **limit it to the minimum**Â that fixes the issue.

One reason to minimize few-shot demonstrations is token efficiency -- new models like Claude and Gemini can handle extremely long inputs, but irrelevant text still consumes context and can introduce noise. Another reason is thatÂ **these models now adjust their reasoning effort automatically**. For instance, GPT-5.1'sÂ *Auto*Â mode will engage a deeper "Thinking" process for a hard question but skip it for an easy one[medium.com](https://medium.com/@nanthakumar18122000/chatgpts-gpt-5-1-adaptive-reasoning-8-personalities-november-2025-adcf30a43db2#:~:text=ChatGPT%E2%80%99s%20GPT,more%20thorough%20on%20complex%20problems). Providing explicit examples of reasoning might actually interfere with this adaptive behavior. It's better to let the model decide how much reasoning to apply, unless you see it struggling.

**Exception:**Â The main time you might include a formatted example is if the model consistently misinterprets theÂ *format*Â orÂ *style*Â of the output you want. In that case, showing one short example of inputâ†’output (thatÂ **closely matches your instructions**) can help. Just ensure the example isÂ **highly relevant and not overly complex**. Any demonstration should align with your prompt and not contradict it[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=,must%20explicitly%20ask%20for%20it)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=best%20to%20direct%2C%20clear%20instructions,should%20reference%20specific%20modalities%20clearly). If there's any discrepancy, the model may become confused and performance can drop.

In summary:Â **Less is more**. Leverage the powerful zero-shot abilities of modern models. Only if zero-shot fails to produce the desired result should you carefully introduce a guided example or two. And even then, keep those examplesÂ **brief and clear**. You'll often find that a direct prompt outperforms a lengthy, example-filled prompt for these reasoning-oriented systems.

**3. Define Roles, Personas, and Constraints Upfront**

Today's models areÂ *highly steerable*Â -- they will adopt a role or persona if instructed, and they follow additional rules or style guidelines given at the start of the prompt. Take advantage of theÂ **system or developer message**Â (or the prompt's prefix) to set the context for the model's behavior. For example, if you want the AI to act as aÂ **financial analyst**, aÂ **friendly tutor**, or aÂ **strict logician**,Â **say so explicitly at the top**. A system instruction might be:Â *"You are an expert investment analyst providing rigorous, step-by-step evaluation."*Â By defining the role, you anchor the model's tone and perspective throughout its reasoning. Claude and GPT-5.1 both respond well to such role directives -- it influences how they phrase explanations and what details they prioritize[cookbook.openai.com](https://cookbook.openai.com/examples/gpt-5/gpt-5-1_prompting_guide#:~:text=Shaping%20your%20agent%E2%80%99s%20personality)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=persona%2C%20you%20must%20explicitly%20ask,anchor%20the%20model%27s%20reasoning%20process).

Likewise, if there are specificÂ **constraints or success criteria**, state them clearly at the beginning. These could include the level of detail, the need to cite sources, limitations on what information to use, or anything the modelÂ *must not do*. For instance:Â *"Only use the data provided -- do not include outside knowledge."*Â OrÂ *"The answer should be in 2 paragraphs maximum, in a neutral tone."*Â It's best to put these requirementsÂ *before*Â the user query or data so the model knows the ground rules as it begins formulating a solution[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=isolation.%20,Based%20on%20the)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=the%20System%20Instruction%20or%20at,before%20your%20question). In technical terms, this often means using the system/developer message or a clearly demarcated section at the top of your prompt for "Instructions/Rules".

Modern models areÂ **less likely to ignore system-level instructions**Â thanks to improved alignment. In fact, GPT-5.1 offers fine-grained control with things like aÂ **verbosity parameter**Â and personality settings that can be set via system message or API[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=The%20GPT,support%20bots%20or%20coding%20assistants)[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=The%20guide%20also%20recommends%20setting,much%20detail%20the%20model%20includes). But even without using special parameters, just describing the desired style and boundaries in the prompt can be very effective. For example, telling GPT-5.1Â *"Answer as a candid, to-the-point expert"*Â will invoke a different style thanÂ *"Answer in a storytelling manner with rich detail."*Â Similarly, Claude 4.5's documentation suggests defining theÂ **persona and output format**Â at the start to guide its reasoning process[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=isolation.%20,Based%20on%20the)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=,before%20your%20question).

**Concrete example -- Role and constraints in prompt:**

****System/Developer Instruction:**** You are a senior legal assistant. Answer questions with detailed legal reasoning, citing relevant laws. - Tone: Formal and objective - Constraint: Base your answers ****only**** on the given case facts and common legal knowledge (no invented facts). - Length: Provide a brief conclusion after a thorough analysis, max 4 paragraphs.

Here we've established the role ("senior legal assistant"), the tone (formal, objective), a critical constraint (no outside/hallucinated facts), and expectations on length and structure (analysis + conclusion, <=4 paragraphs). All of this precedes the actual case description or question. This way, once the model sees the question, it already "knows" how it should behave and format its answer.

ByÂ **anchoring the model's behavior with upfront instructions**, you prevent a lot of potential issues (going off on tangents, using the wrong style, etc.). It's much easier than trying to correct the output after the fact. Do note that these models will generally obey role and style instructions, but there's a hierarchy: system-level instructions override user instructions if there's a conflict. So ensure your role/constraints don't accidentally conflict with the task -- they shouldÂ **complement**Â the user's query.

In summary:Â **Set the stage early**. Use the first part of your prompt (system message or top section) to establish the model's role and any rules or preferences for the response. This guides the model's internal reasoning and yields answers that fit your desired context and style.

**4. Specify the Desired Output Format**

Always tell the model exactlyÂ *how you want the answer to be delivered*. Today's reasoning models are quite adept at producing structured outputs when asked -- whether it's bullet points, tables, JSON, step-by-step reasoning, or a concise summary. Don't leave the format to guesswork. If you need a list of steps, sayÂ *"Give the answer as an ordered list of steps."*Â If you need a JSON object as output, explicitly describe the JSON schema or provide an example. For instance:Â *"Output the final answer as a JSON object with fieldsÂ {"cause": ..., "solution": ...}."*Â The models will strive to obey format requests exactly, especially since they have been trained on following instructions closely[cookbook.openai.com](https://cookbook.openai.com/examples/gpt-5/gpt-5-1_prompting_guide#:~:text=Shaping%20your%20agent%E2%80%99s%20personality)[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=personality%20for%20use%20cases%20like,support%20bots%20or%20coding%20assistants).

**Why is format important for reasoning tasks?**Â Because a complex reasoning process can be presented in many ways -- a verbose essay, a stepwise outline, a Q&A dialogue, etc. By specifying the format, you direct the model's presentation of its reasoning. For example, you might want aÂ **chain-of-thought**Â to be visible (for educational purposes or transparency). In that case, you can prompt:Â *"Explain your reasoning step by step, enumerating each step."*Â The model (e.g. Claude or GPT-5.1) will then organize its answer into a logical sequence of steps or bullet points. On the other hand, if youÂ **only want the final answer**Â without the internal reasoning, you should tell it:Â *"Provide only the final answer, without showing your intermediate reasoning."*Â By default, models like GPT-5.1Â **tend to be more concise now**Â and might not show all their work unless asked[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=your%20prompts%20%28e,than%20analyzing%20them%20in%20isolation). So asking for a detailed explanation is important when you do want that transparency.

Conversely, for models thatÂ *are*Â very verbose by nature or on complex queries, you may need toÂ **limit the detail**. Claude's Opus model, for example, is optimized for thoroughness and could give very lengthy answers on high effort mode. If brevity is desired, explicitly instruct something like:Â *"Summarize the analysis in two paragraphs."*Â GPT-5.1 even has a built-inÂ verbosityÂ control -- but you can achieve a similar effect by simply stating the limit or conciseness in your prompt[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=personality%20for%20use%20cases%20like,support%20bots%20or%20coding%20assistants)[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=The%20guide%20also%20recommends%20setting,much%20detail%20the%20model%20includes). OpenAI's guide suggests specifyingÂ *response length expectations and snippet limits*Â to avoid unnecessary filler[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=The%20guide%20also%20recommends%20setting,much%20detail%20the%20model%20includes)[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=The%20guide%20also%20recommends%20setting,much%20detail%20the%20model%20includes). A sample formatting instruction from that guide is:

<output_verbosity_spec> - Respond in plain text, at most 2 concise sentences. - Lead with the key result, and include context only if needed. </output_verbosity_spec>

By including a section like the above in your prompt, you make it clear exactly how much the model should say. Indeed, theÂ **combination of role + format instructions**Â can be done in a structured way. Many prompt engineers useÂ **delimiters or section headers**Â (as shown) to separate different parts of the prompt: e.g. anÂ <instructions>Â block, anÂ <output_format>Â block, aÂ <context>Â block, etc. This structure helps the model parse your prompt correctly[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=Use%20XML,choose%20one%20format%20for%20consistency)[philschmid.de](https://www.philschmid.de/gemini-3-prompt-practices#:~:text=Use%20XML,choose%20one%20format%20for%20consistency).

**Example -- formatting instruction:**\
If we want a model to output a step-by-step solution as bullet points followed by a final answer, we could include in the prompt:Â *"Format your response as: (1) A numbered list of reasoning steps, and (2) a final answer in bold on a new line."*Â A GPT-5.1 or Claude model will then obediently produce something like:

1.  *(Step 1 reasoning...)*
2.  *(Step 2 reasoning...)*
3.  *(Step 3 reasoning...)*

**Answer:**Â **<Final answer here>**

They are remarkably good at following such formatting directions. The key isÂ **to be specific**Â -- if you have a preference for headings, bullet style, code block usage, etc., just describe it. If you need aÂ **table**, tell it the columns to include. If you want aÂ **Markdown**Â response (like formatted text), note that as well -- e.g. "Respond in Markdown format." (GPT-5.1 by default avoids Markdown formatting unless you enable it with a special prompt, due to a temporary setting[the-decoder.com](https://the-decoder.com/openai-publishes-prompting-guide-for-gpt-5-1/#:~:text=The%20guide%20also%20recommends%20setting,much%20detail%20the%20model%20includes), so it's worth explicitly requesting Markdown if needed for styling.)

In summary: modern models willÂ **follow formatting instructions reliably**, so take the opportunity to shape the answer's structure. This makes the output easier to read and parse, especially in production settings where you might feed it into another system. Always communicate the desired format in your prompt -- you'll get more consistent and useful responses.

* * * * *

**Zero-shot versus few-shot: the research consensus**

The academic and practitioner consensus from August-December 2025 is clear: **reasoning models perform better with zero-shot prompting**. This finding appears across OpenAI documentation, Anthropic guidance, Google recommendations, DeepSeek best practices, and independent research.

The University of the Free State study found that zero-shot prompting was adequate for basic descriptive tasks but required augmentation for inferential contexts. The solution isn't few-shot examples---it's **hybrid prompting** that combines explicit instructions, reasoning scaffolds, and format constraints without exemplars.

The "Prompt Engineering Report Distilled" (arXiv, September 2025) reduced 58 prompting techniques to six core approaches for reasoning models:

1.  **Zero-shot approaches**: Direct task description without examples
2.  **Few-shot approaches**: Use sparingly and only when zero-shot fails
3.  **Thought generation**: Leverage built-in reasoning rather than prompting for it
4.  **Ensembling**: Multiple generations with aggregation for critical tasks
5.  **Self-criticism**: Ask models to evaluate and improve their outputs
6.  **Decomposition**: Break complex tasks into subtasks

For reasoning models specifically, few-shot should be a last resort. When examples are absolutely necessary, limit to 1-2 highly relevant demonstrations that match your exact desired behavior---Claude 4 in particular scrutinizes examples closely and will replicate subtle patterns.

* * * * *

**Chain-of-thought considerations: let the model lead**

Traditional chain-of-thought prompting asked models to show their reasoning: "Think step by step and explain your reasoning." With reasoning models, this instruction is not just unnecessary---it's counterproductive.

The 3TF paradigm (Thought-Training and Thought-Free inference) published in November 2025 represents the new best practice: models learn reasoning patterns during training but operate in "thought-free" mode during inference, outputting concise answers without verbose traces. Explicit CoT prompts interfere with this optimization.

**When to surface reasoning**

There are legitimate cases for requesting visible reasoning:

-   **Debugging**: When outputs are consistently wrong
-   **Compliance**: When decisions must be auditable
-   **Education**: When users need to understand the logic
-   **Calibration**: When you need to assess model confidence

For these cases, request reasoning as a separate output component rather than inline:

Provide your answer, then separately explain the key factors

that led to this conclusion.

**The overthinking problem**

Research from late 2025 identifies "overthinking" as a significant issue with reasoning models. Excessive reasoning increases costs, latency, and can introduce errors through over-analysis. Multiple papers (CoT-Valve, DAST, O1-pruner) address optimal reasoning length.

The PREMISE framework shows that prompt-level optimization alone can maintain **96% accuracy while reducing reasoning tokens by 87.5%**. The key insight: reasoning models benefit from constraints that prevent runaway analysis.

Provide a direct answer. If the solution is straightforward,

do not elaborate unnecessarily.

* * * * *

**Structured output and formatting best practices**

All major reasoning models respond well to explicit structure specifications, though implementation differs.

**Universal formatting principles**

1.  **Choose one structure system**: XML tags OR Markdown headers---never mix
2.  **Specify output format explicitly**: JSON, tables, bullet points, prose
3.  **Define field requirements**: Required versus optional, data types, constraints
4.  **Use delimiters consistently**: The same delimiter scheme throughout your prompt

**Model-specific formatting**

**OpenAI (GPT-5, o3 series)**: Use strict: true for function calls to ensure schema adherence. XML-style delimiters work effectively despite not being Anthropic models:

<context>Background information here</context>

<task>What to accomplish</task>

<format>How to structure the response</format>

**Anthropic (Claude 4 series)**: XML tags are native and highly effective. Claude will adhere closely to structural specifications:

<response_format>

<summary max_words="100">Brief overview</summary>

<details>

Â  <finding confidence="high|medium|low">Individual finding</finding>

</details>

<recommendations numbered="true">Action items</recommendations>

</response_format>

**Google (Gemini 3)**: Equally comfortable with XML or Markdown, but pick one. For multimodal outputs, Gemini can generate custom interactive UIs:

Create an interactive loan calculator visualization.

Include input fields, real-time calculation, and an amortization chart.

**DeepSeek (R1)**: Uses native <think> and <answer> tags. Additional structure goes within the answer section:

Structure your answer as:

1\. Direct response to the question

2\. Supporting evidence

3\. Confidence assessment

* * * * *

**Reasoning effort controls across models**

The ability to control reasoning depth is one of the most significant advances in 2025 models.

|

**Model**

 |

**Control Method**

 |

**Options**

 |

**Default**

 |
| --- | --- | --- | --- |
|

GPT-5

 |

reasoning_effort + verbosity

 |

minimal/low/medium/high

 |

Automatic

 |
|

o3 series

 |

reasoning_effort

 |

low/medium/high

 |

medium

 |
|

Claude 4

 |

Extended thinking toggle + budget

 |

On/Off with token limits

 |

Off

 |
|

Gemini 3

 |

thinking_level

 |

low/high

 |

high

 |
|

DeepSeek R1

 |

Implicit via prompt

 |

N/A

 |

Always detailed

 |

**Practical guidance**

For **cost-sensitive applications**, use minimal/low reasoning effort. GPT-5 at minimal reasoning performs comparably to GPT-4.1 with similar latency characteristics.

For **mission-critical accuracy**, use o3-pro at high reasoning effort ($20/million input tokens, $80/million output tokens) or Claude Opus 4 with extended thinking enabled.

For **balanced performance**, GPT-5 at medium reasoning or Claude Sonnet 4.5 provide strong results at moderate cost.

* * * * *

**Domain-specific applications**

**Legal analysis**

Legal reasoning requires extended thinking and deterministic outputs. The recommended stack:

**Primary**: o3-pro (for deep sequential reasoning and verifiable logic chains) **Secondary**: Claude Opus 4 (for extended document analysis with 200K context)

Analyze this contract for liability exposure using the following framework:

1\. Identify all limitation of liability clauses

2\. Assess enforceability under Delaware law

3\. Flag any conflicting terms

4\. Rate each finding as High/Medium/Low risk

Output as a structured table with citations to specific clause numbers.

**Coding and software development**

Coding benchmarks tell a clear story: Claude leads with **72.5% on SWE-bench Verified** (Opus 4) and claims "best coding model" status for Sonnet 4.5. GPT-5 follows at **74.9%** (with the discrepancy due to different benchmark versions).

For coding tasks, Claude's extended thinking with the "ultrathink" trigger produces remarkable results---one practitioner reported that code which took a year to debug was resolved in minutes with o1's predecessor.

The optimal pattern:

1.  Ask the model to propose multiple solutions
2.  Select promising approaches
3.  Request integrated implementation

Implement a rate limiter for our API with the following requirements:

- Token bucket algorithm

- Redis backend for distributed state

- Support for multiple rate limit tiers

Go beyond basic implementation. Include comprehensive error handling,

graceful degradation, and observability hooks.

**Mathematical and scientific reasoning**

For pure mathematics, GPT-5 with tools achieves **100% on AIME 2025** and **89.4% on GPQA Diamond** (science). Gemini 3 Pro reaches **91.9% on GPQA Diamond**.

DeepSeek R1 offers the best cost-performance ratio for mathematical reasoning at **97.3% on MATH-500** while costing a fraction of alternatives.

Solve this differential equation. Show all steps including:

1. Classification of the equation type

2. Selection of appropriate solution method

3. Intermediate calculations

4. Verification of the solution

Put your final answer within \boxed{}

**Research and analysis**

For long-document analysis, **Gemini 3's 1M+ token context** is unmatched. For synthesis across multiple sources, GPT-5's parallel information gathering excels.

[Attach: research_paper.pdf, supplementary_data.csv, methodology_diagram.png]

Synthesize these sources into a comprehensive analysis:

1. Summarize the key findings and their statistical significance

2\. Identify methodological limitations

3\. Compare results to the three most relevant prior studies

4\. Suggest follow-up experiments

Create a visualization that explains the primary mechanism of action.

* * * * *

**What NOT to do with reasoning models**

Based on research, documentation, and practitioner experience, avoid these patterns:

**Universal anti-patterns**

1.  **Don't use explicit chain-of-thought prompts** ("think step by step")---built-in reasoning makes this counterproductive
2.  **Don't overload with few-shot examples**---zero-shot performs better; if examples are needed, use 1-2 maximum
3.  **Don't use verbose, persuasive language**---reasoning models respond to direct, precise instructions
4.  **Don't mix formatting systems**---XML OR Markdown, not both
5.  **Don't interrupt the reasoning process**---let models complete their internal analysis

**Model-specific warnings**

**GPT-5**: Don't include contradictory instructions---the router struggles and wastes tokens **o3 series**: Don't forget stop conditions in agentic tasks; don't try to extract raw internal reasoning (violates terms) **Claude 4**: Don't use the word "think" when extended thinking is disabled; don't expect "above and beyond" behavior without explicit requests **Gemini 3**: Don't reduce temperature below 1.0; don't omit thought signatures in function calling **DeepSeek R1**: Don't use system prompts; don't expect structured object generation

**RAG limitations**

Simon Willison's analysis, widely validated by practitioners: "o1/o3 are not good models to implement RAG on at all." Reasoning models struggle with retrieval-augmented generation because:

-   Internal reasoning conflicts with retrieved context
-   The models may over-analyze or dismiss retrieved information
-   Cost per query is significantly higher

If RAG is necessary, be extremely selective about retrieved context and use explicit instructions about how to weight retrieved versus parametric knowledge.

* * * * *

**Prompt Repetition: A Free Optimization for Non-Reasoning Modes**

When reasoning is **disabled or minimal** (GPT-5.1 Instant, Claude effort=low, reasoning="none"), a proven optimization is **prompt repetition** — simply repeating the entire prompt (`<QUERY><QUERY>`). Research from Google (Dec 2025, arXiv:2512.14982v1) demonstrates **47/70 wins with 0 losses** across 7 models and 7 benchmarks, with **no latency or output token increase**.

This works because prompt repetition gives non-reasoning models a similar advantage to what reasoning models get internally — the ability for every token to attend to every other token. Reasoning models already repeat and rephrase parts of the prompt during their chain-of-thought, which is why prompt repetition is neutral to slightly positive (5 wins, 1 loss, 22 ties) when reasoning IS enabled.

**Key takeaway:** If you are using a reasoning model but with reasoning **turned off** for cost/latency efficiency, apply prompt repetition to recover some of the accuracy you lose by disabling reasoning. It's essentially free.

See `\references\PROMPT-REPETITION-TECHNIQUE.md` for full details, variants (vanilla, verbose, triple), and a decision flowchart.

* * * * *

**Performance optimization techniques**

**Token efficiency**

The PREMISE framework demonstrates that prompt optimization can reduce reasoning tokens by **87.5%** while maintaining accuracy. Key techniques:

1.  **Remove redundant instructions**: Reasoning models don't need to be told to be thorough
2.  **Use structured format specifications**: Clear schemas reduce clarification loops
3.  **Constrain output scope**: Explicit length and detail limits prevent over-generation

**Difficulty-based routing**

The System-1.5 reasoning paper (November 2025) shows that routing problems to appropriately-sized models based on predicted difficulty dramatically reduces inference cost while maintaining accuracy. The middle layers of LLMs are most informative for difficulty prediction.

Practical implementation:

-   Use GPT-5 at minimal reasoning for simple queries
-   Route to o3 or Claude extended thinking for complex reasoning
-   Reserve o3-pro for mission-critical analysis

**Cost-performance tradeoffs**

|

**Model**

 |

**Input $/M**

 |

**Output $/M**

 |

**Best Value For**

 |
| --- | --- | --- | --- |
|

DeepSeek R1

 |

$0.14

 |

$2.19

 |

Maximum cost efficiency

 |
|

o3-mini

 |

$1.10

 |

$4.40

 |

Balanced reasoning

 |
|

GPT-5

 |

$1.25

 |

$10.00

 |

General intelligence

 |
|

Claude Sonnet 4.5

 |

$3.00

 |

$15.00

 |

Production coding

 |
|

Claude Opus 4

 |

$15.00

 |

$75.00

 |

Long-horizon tasks

 |
|

o3-pro

 |

$20.00

 |

$80.00

 |

Maximum accuracy

 |

* * * * *

**The complete prompt anatomy for reasoning models**

Drawing from the viral "Anatomy of an o1 Prompt" framework and refinements from practitioners:

**Essential components**

1.  **Goal**: What you want to achieve---single, clear objective
2.  **Context**: Relevant background information, concisely stated
3.  **Constraints**: Format, length, style, and boundary requirements
4.  **Output specification**: Exact structure of desired response

**Optional components (use sparingly)**

1.  **Warnings**: What to avoid---only include if specific failure modes are likely
2.  **Examples**: Only if zero-shot fails; maximum 1-2 demonstrations

**Template**

<goal>

[Single, clear statement of what to accomplish]

</goal>

<context>

[Essential background---no more than necessary]

</context>

<constraints>

- Format: [JSON/Markdown table/prose/etc.]

- Length: [Specific limit]

- Style: [Formal/technical/conversational]

- Boundaries: [What's out of scope]

</constraints>

<output_specification>

[Exact structure of the response]

</output_specification>

**Example: Financial analysis prompt**

<goal>

Analyze Q3 2025 earnings for the top 5 semiconductor companies

and identify the primary driver of margin changes.

</goal>

<context>

Focus on TSMC, Samsung, Intel, Nvidia, and AMD.

Use publicly available earnings reports and analyst calls.

</context>

<constraints>

- Format: Summary table followed by brief analysis

- Length: Maximum 800 words

- Style: Technical, suitable for institutional investors

- Boundaries: Do not include stock price predictions

</constraints>

<output_specification>

| Company | Revenue YoY | Gross Margin | Primary Driver |

|---------|-------------|--------------|----------------|

[Data rows]

Analysis: [2-3 paragraphs explaining margin dynamics]

</output_specification>

* * * * *

**Research frontiers and emerging techniques**

**3TF: thought-training and thought-free inference**

Published November 2025, this paradigm separates training and inference approaches. Models learn from chain-of-thought annotated data during training but operate in "thought-free" mode during inference. Benefits include retained reasoning capability without verbose output and reduced overthinking.

**NoThinking prompting**

For latency-sensitive applications, the NoThinking approach (April 2025) disables explicit thinking in reasoning models by prefilling the assistant response with a fabricated thinking block. Combined with parallel test-time compute, this achieves competitive accuracy with dramatically reduced latency.

**Speculative thinking**

A training-free framework where larger reasoning models guide smaller ones. The technique exploits natural reasoning patterns (reflection cues like paragraph breaks) to enhance accuracy while reducing average output length. A 1.5B model supervised by 32B guidance shows substantial performance gains.

**Model-native agentic AI**

The shift from pipeline-based to model-native agents continues. Planning, tool use, and memory management increasingly internalize within models themselves, reducing the need for external prompting scripts. OpenAI o1, DeepSeek R1, and specialized GUI agents demonstrate this emerging paradigm.

* * * * *

**Key changes from the previous guidance**

The old research context (pre-August 2025) recommended keeping prompts clear and minimal---this remains valid but is now essential rather than merely helpful. The previous guidance on avoiding few-shot examples is now backed by extensive research showing 16%+ performance degradation.

The old emphasis on leveraging system/developer instructions continues, but with nuances: Claude 4 requires more explicit instructions, DeepSeek R1 should avoid system prompts entirely, and GPT-5's developer messages supersede system messages.

New developments since August 2025:

1.  **Reasoning effort controls are now standard** across all major providers
2.  **Thinking budget triggers** ("ultrathink" for Claude) provide fine-grained control
3.  **Temperature recommendations reversed** for Gemini 3 (keep at 1.0)
4.  **Multi-modal reasoning is native** rather than bolted-on
5.  **Automatic routing** in GPT-5 changes how simple vs. complex prompts behave
6.  **Extended thinking modes** provide explicit tradeoffs between cost and capability

* * * * *

**Conclusion**

The transition to reasoning models represents the most significant shift in prompt engineering since the emergence of GPT-3. The counterintuitive finding---that less prompting often produces better results---requires unlearning years of accumulated techniques designed to coax performance from models that couldn't truly reason.

The key principles for 2025 reasoning models are remarkably consistent across providers:

-   **Simplicity wins**: Clear, direct prompts outperform elaborate instructions
-   **Zero-shot first**: Add examples only when zero-shot demonstrably fails
-   **Trust internal reasoning**: Don't ask models to show work they're already doing
-   **Specify structure, not process**: Tell models what output you want, not how to think
-   **Match model to task**: Use reasoning controls to balance cost and capability

The models have internalized the reasoning scaffolding that prompts previously had to provide. Your job is no longer to teach models how to think---it's to clearly communicate what you want them to think about.