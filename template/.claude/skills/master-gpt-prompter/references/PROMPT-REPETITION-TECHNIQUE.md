# Prompt Repetition Technique

**Source:** "Prompt Repetition Improves Non-Reasoning LLMs" — Leviathan, Kalman, Matias (Google Research, Dec 2025, arXiv:2512.14982v1)

---

## Core Finding

Simply repeating the input prompt (`<QUERY><QUERY>`) significantly improves accuracy for popular LLMs when reasoning is disabled. The technique won **47 out of 70 tests with 0 losses** across 7 models and 7 benchmarks.

**No increase in output tokens. No increase in latency.** The repetition happens in the parallelizable prefill stage, making it essentially free.

---

## Why It Works

In causal (autoregressive) language models, each token can only attend to tokens that came before it. This means early tokens in a prompt never "see" later tokens. By repeating the prompt, every token from the first copy gets a second chance to attend to all other tokens in the second copy. This is analogous to what reasoning models do internally — they repeat and rephrase parts of the prompt during their chain-of-thought.

---

## The Three Variants

### 1. Vanilla Repetition (Default recommendation)
Simply concatenate the prompt with itself:
```
<QUERY><QUERY>
```
**Example:**
```
What is the capital of France? What is the capital of France?
```

### 2. Verbose Repetition (Similar performance)
Add a natural language bridge between repetitions:
```
<QUERY> Let me repeat that: <QUERY>
```
**Example:**
```
Analyze the following data and identify the top 3 trends. [DATA]
Let me repeat that:
Analyze the following data and identify the top 3 trends. [DATA]
```

### 3. Triple Repetition (For hard tasks requiring precise recall)
Repeat three times with bridging phrases:
```
<QUERY> Let me repeat that: <QUERY> Let me repeat that one more time: <QUERY>
```
**When to use:** Tasks requiring precise recall from within long context (name lookup, data matching, middle-of-list retrieval). Sometimes substantially better than double repetition on hard tasks.

---

## When to Use Prompt Repetition

### Always Use (Strong recommendation)
- **Non-reasoning mode**: GPT-5.1 Instant, Claude with effort=low, any model with reasoning disabled/set to "none"
- **Position-sensitive tasks**: When the answer depends on information placement (options-first multiple choice, name lookup in lists, middle-match tasks)
- **Long context retrieval**: When the model must find and use specific information buried in a long prompt

### Safe to Use (Neutral to slightly positive)
- **With reasoning enabled**: 5 wins, 1 loss, 22 ties — so it does not hurt and may help slightly
- **General purpose prompts**: Low risk, potential upside

### Most Impactful Scenarios
- Options-first multiple choice (where choices appear before the question)
- Name/value lookup in long lists or tables
- Middle-match tasks (finding information in the middle of context)
- Any task where order/position of information matters

### Don't Use
- When the prompt is already near the context window limit (repetition doubles/triples input length)
- When input token cost is the primary constraint (though output tokens stay the same)

---

## Key Statistics

| Metric | Result |
|--------|--------|
| Win/Loss (without reasoning) | **47 wins / 0 losses / 23 ties** out of 70 tests |
| Win/Loss (with reasoning) | 5 wins / 1 loss / 22 ties out of 28 tests |
| Models tested | Gemini, GPT, Claude, DeepSeek (7 models total) |
| Benchmarks tested | 7 diverse benchmarks |
| Output token increase | **None** |
| Latency increase | **None** (prefill is parallelizable) |

---

## Important Controls from the Research

- **Padding does NOT work**: Simply adding filler text to match the length of a repeated prompt does NOT help. The gains come specifically from repeating *meaningful content*.
- **Not a context length effect**: The improvement is not because of having more tokens — it's because the model gets a second pass of attention over the same information.
- **Works across model families**: Tested on Gemini, GPT, Claude, and DeepSeek — the technique is model-agnostic.

---

## Integration with Other Techniques

### With Structured Prompts (XML tags, sections)
Repeat the entire structured prompt, including tags:
```xml
<context>Your context here</context>
<task>Your task here</task>

Let me repeat that:

<context>Your context here</context>
<task>Your task here</task>
```

### With System/Developer Messages
Apply repetition to the **user message** portion. System/developer messages typically don't need repetition as they are processed differently by most APIs.

### With Few-Shot Examples
If using few-shot examples, include them in both repetitions so the model attends to them fully.

### With Reasoning Models
When reasoning is enabled, prompt repetition is safe but less impactful (the model already internally re-processes the prompt during its chain-of-thought). Use it as a "free insurance" — no downside, potential upside.

---

## Template for Application

When crafting a prompt for a non-reasoning LLM, transform the final prompt like this:

**Before (standard):**
```
[Your complete prompt here]
```

**After (with vanilla repetition):**
```
[Your complete prompt here]

[Your complete prompt here]
```

**After (with verbose repetition):**
```
[Your complete prompt here]

Let me repeat that:

[Your complete prompt here]
```

**After (with triple repetition — for hard recall tasks):**
```
[Your complete prompt here]

Let me repeat that:

[Your complete prompt here]

Let me repeat that one more time:

[Your complete prompt here]
```

---

## Decision Flowchart

1. **Is the target model in non-reasoning / low-effort mode?**
   - YES → Apply prompt repetition (vanilla or verbose). **Strongly recommended.**
   - NO → Continue to step 2.

2. **Is reasoning enabled but the task is position-sensitive or requires precise recall?**
   - YES → Consider applying prompt repetition as "free insurance."
   - NO → Prompt repetition is optional (neutral effect).

3. **Is the task extremely hard (precise data retrieval from long context)?**
   - YES → Consider triple repetition.
   - NO → Vanilla or verbose repetition is sufficient.

4. **Is the prompt near the context window limit?**
   - YES → Skip repetition (not enough room).
   - NO → Apply repetition.