HOW TO MAKE PROMPTS FOR AI-AGENTS
So the Prompt Anatomy for the traditional prompting where:
Instructions
Context
User input
Output helper
Now when prompting for AI-agents the Prompt anatomy for AI-agents prompts looks like this:
Instructions
Context
Tool use description
Autonomy description
User input
Output helper
Explanation of the two AI-agent specific elements (Tool use description and
Autonomy description)
Traditionelle LLM'er som ChatGPT fungerer efter et simpelt princip:
Input → GPT → Output. That's it.

Men AI-agents er en helt anden sag…
Input + værktøjer → autonom beslutningstagning → handling → output.
Og det kræver derfor en helt anden måde at prompte på!
Når du prompter til AI-agents, skal du tænke på:
1. Hvordan agenten skal modtage input og anvende tilknyttede værktøjer
2. Hvordan den selvstændigt vælger det rette værktøj til opgaven
3. Hvordan den kan arbejde uafhængigt uden din konstante indblanding
Det handler ikke længere bare om at skrive en god prompt.
Det handler om at designe et helt workflow.
Jeg har før delt den traditionelle prompt anatomi, som er opdelt i:
• En intruks
• kontekst
• bruger input
• output hjælper elementer.
Anatomien i en AI-agent prompt har to nye kritiske elementer:
• "Tool beskrivelse" = Hvilke værktøjer agenten kan bruge og hvordan
• "Autonomibeskrivelse" = Hvornår og hvordan den må handle selvstændigt

Dette betyder konkret at dine prompts skal indeholde:
• Klare definitioner af tilgængelige værktøjer
• Instruktioner om hvornår hvert værktøj skal bruges og hvordan
• Parametre for værktøjernes input
• Håndtering af værktøjernes output
Og modsat traditionelle LLM'er og automations, hvor du er en stor del af processen...
Så kræver AI-agents klare grænser for deres autonomi:
• Hvornår må agenten handle vs. hvornår skal den spørge dig først?
• Hvilke specifikke begrænsninger har agentens handlinger?
• En meget specifik beskrivelse af fejlhåndtering
Eksempel på tool description:

Ikke bare forklare den, hvilke tools der er tilgængelig, men også hvordan agenten skal bruge
dem.
Explanation of traditional prompt anatomy
Instruction:
The instructions are what we want the AI to do for us.
Specifically, what exactly do we need from the machine?

Context
Context provides the additional information that helps the AI understand the situation in
which your instruction should be applied.
By providing context, we increase the chances of hitting our target and make better use of the
AI's internal knowledge.
User input
User input is the variable you want the AI to write about.
The instruction and context are usually fixed parameters, so the user input is the dynamic
element you use to specify different topics/data.

Output helper
An output helper ensures that the model stays on track and remembers the instructions.
There are two different types.
*Output helpers aren't always necessary but can be helpful with complex prompts.
Output helper 1
(OH 1)
A brief and clear description of the desired output/reiteration of instructions + key
elements from the context.

This one is particularly useful for long and complex prompts with a lot of context and
input.
Output helper 2
(OH 2)
A guideline for the AI to follow a specific direction from the get go.
Especially useful if the AI struggles to understand the goal.