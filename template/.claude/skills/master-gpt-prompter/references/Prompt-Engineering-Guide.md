Prompt Engineering Guide
Prompt engineering is a relatively new discipline for developing and
optimizing prompts to efficiently use language models (LMs) for a wide
variety of applications and research topics. Prompt engineering skills
help to better understand the capabilities and limitations of large
language models (LLMs).
Researchers use prompt engineering to improve the capacity of LLMs on a
wide range of common and complex tasks such as question answering and
arithmetic reasoning. Developers use prompt engineering to design robust
and effective prompting techniques that interface with LLMs and other
tools.
Prompt engineering is not just about designing and developing prompts.
It encompasses a wide range of skills and techniques that are useful for
interacting and developing with LLMs. It's an important skill to
interface, build with, and understand capabilities of LLMs. You can use
prompt engineering to improve safety of LLMs and build new capabilities
like augmenting LLMs with domain knowledge and external tools.
Basics of Prompting
Basic Prompts
You can achieve a lot with simple prompts, but the quality of results
depends on how much information you provide it and how well-crafted it
is. A prompt can contain information like
the instruction or question you are passing to the model and include
other details such as context, inputs, or examples. You can use
these elements to instruct the model better and as a result get better
results.
Let's get started by going over a basic example of a simple prompt:
Prompt
The sky is
Output:
blue The sky is blue on a clear day. On a cloudy day, the sky may be
gray or white.

As you can see, the language model outputs a continuation of strings
that make sense given the context "The sky is". The output might be
unexpected or far from the task you want to accomplish.
This basic example also highlights the necessity to provide more context
or instructions on what specifically you want to achieve.
Let's try to improve it a bit:
Prompt:
Complete the sentence: The sky is
Output:
so beautiful today.
Is that better? Well, you told the model to complete the sentence so the
result looks a lot better as it follows exactly what you told it to do
("complete the sentence"). This approach of designing optimal prompts
to instruct the model to perform a task is what's referred to
as prompt engineering.
The example above is a basic illustration of what's possible with LLMs
today. Today's LLMs are able to perform all kinds of advanced tasks
that range from text summarization to mathematical reasoning to code
generation.
Prompt Formatting
You have tried a very simple prompt above. A standard prompt has the
following format:
<Question>?
or
<Instruction>
You can format this into a question answering (QA) format, which is
standard in a lot of QA datasets, as follows:
Q: <Question>?A:
When prompting like the above, it's also referred to as zero-shot
prompting, i.e., you are directly prompting the model for a response
without any examples or demonstrations about the task you want it to
achieve. Some large language models do have the ability to perform

zero-shot prompting but it depends on the complexity and knowledge of
the task at hand.
Given the standard format above, one popular and effective technique to
prompting is referred to as few-shot prompting where you provide
exemplars (i.e., demonstrations). You can format few-shot prompts as
follows:
<Question>?<Answer><Question>?<Answer><Question>?<Answer><Question>?
The QA format version would look like this:
Q: <Question>?A: <Answer>Q: <Question>?A: <Answer>Q:
<Question>?A: <Answer>Q: <Question>?A:
Keep in mind that it's not required to use QA format. The prompt format
depends on the task at hand. For instance, you can perform a simple
classification task and give exemplars that demonstrate the task as
follows:
Prompt:
This is awesome! // PositiveThis is bad! // NegativeWow that movie was
rad! // PositiveWhat a horrible show! //
Output:
Negative
Few-shot prompts enable in-context learning, which is the ability of
language models to learn tasks given a few demonstrations.
Elements of a Prompt
As we cover more and more examples and applications with prompt
engineering, you will notice that certain elements make up a prompt.
A prompt contains any of the following elements:
Instruction - a specific task or instruction you want the model to
perform
Context - external information or additional context that can steer
the model to better responses
Input Data - the input or question that we are interested to find a
response for

Output Indicator - the type or format of the output.
You do not need all the four elements for a prompt and the format
depends on the task at hand. We will touch on more concrete examples in
upcoming guides.
Start Simple
As you get started with designing prompts, you should keep in mind that
it is really an iterative process that requires a lot of experimentation
to get optimal results. Using a simple playground from OpenAI or Cohere
is a good starting point.
You can start with simple prompts and keep adding more elements and
context as you aim for better results. Iterating your prompt along the
way is vital for this reason. As you read the guide, you will see many
examples where specificity, simplicity, and conciseness will often give
you better results.
When you have a big task that involves many different subtasks, you can
try to break down the task into simpler subtasks and keep building up as
you get better results. This avoids adding too much complexity to the
prompt design process at the beginning.
The Instruction
You can design effective prompts for various simple tasks by using
commands to instruct the model what you want to achieve, such as
"Write", "Classify", "Summarize", "Translate", "Order", etc.
Keep in mind that you also need to experiment a lot to see what works
best. Try different instructions with different keywords, contexts, and
data and see what works best for your particular use case and task.
Usually, the more specific and relevant the context is to the task you
are trying to perform, the better. We will touch on the importance of
sampling and adding more context in the upcoming guides.
Others recommend that you place instructions at the beginning of the
prompt. Another recommendation is to use some clear separator like
"###" to separate the instruction and context.
For instance:
Prompt:
### Instruction ###Translate the text below to Spanish:Text: "hello!"

Output:
¡Hola!
Specificity
Be very specific about the instruction and task you want the model to
perform. The more descriptive and detailed the prompt is, the better the
results. This is particularly important when you have a desired outcome
or style of generation you are seeking. There aren't specific tokens or
keywords that lead to better results. It's more important to have a
good format and descriptive prompt. In fact, providing examples in the
prompt is very effective to get desired output in specific formats.
When designing prompts, you should also keep in mind the length of the
prompt as there are limitations regarding how long the prompt can be.
Thinking about how specific and detailed you should be. Including too
many unnecessary details is not necessarily a good approach. The details
should be relevant and contribute to the task at hand. This is something
you will need to experiment with a lot. We encourage a lot of
experimentation and iteration to optimize prompts for your applications.
As an example, let's try a simple prompt to extract specific
information from a piece of text.
Prompt:
Extract the name of places in the following text. Desired format:Place:
<comma_separated_list_of_company_names>Input: "Although these
developments are encouraging to researchers, much is still a mystery.
"We often have a black box between the brain and the effect we see in
the periphery," says Henrique Veiga-Fernandes, a neuroimmunologist at
the Champalimaud Centre for the Unknown in Lisbon. "If we want to use it
in the therapeutic context, we actually need to understand the
mechanism.""
Output:
Place: Champalimaud Centre for the Unknown, Lisbon
Input text is obtained from this Nature article(opens in a new
tab).
Avoid Impreciseness

Given the tips above about being detailed and improving format, it's
easy to fall into the trap of wanting to be too clever about prompts and
potentially creating imprecise descriptions. It's often better to be
specific and direct. The analogy here is very similar to effective
communication -- the more direct, the more effective the message gets
across.
For example, you might be interested in learning the concept of prompt
engineering. You might try something like:
Explain the concept prompt engineering. Keep the explanation short, only
a few sentences, and don't be too descriptive.
It's not clear from the prompt above how many sentences to use and what
style. You might still somewhat get good responses with the above
prompts but the better prompt would be one that is very specific,
concise, and to the point. Something like:
Use 2-3 sentences to explain the concept of prompt engineering to a high
school student.
To do or not to do?
Another common tip when designing prompts is to avoid saying what not to
do but say what to do instead. This encourages more specificity and
focuses on the details that lead to good responses from the model.
Here is an example of a movie recommendation chatbot failing at exactly
what I don't want it to do because of how I wrote the instruction --
focusing on what not to do.
Prompt:
The following is an agent that recommends movies to a customer. DO NOT
ASK FOR INTERESTS. DO NOT ASK FOR PERSONAL INFORMATION.Customer: Please
recommend a movie based on my interests.Agent:
Output:
Sure, I can recommend a movie based on your interests. What kind of
movie would you like to watch? Do you prefer action, comedy, romance, or
something else?
Here is a better prompt:
Prompt:

The following is an agent that recommends movies to a customer. The
agent is responsible to recommend a movie from the top global trending
movies. It should refrain from asking users for their preferences and
avoid asking for personal information. If the agent doesn't have a
movie to recommend, it should respond "Sorry, couldn't find a movie to
recommend today.".Customer: Please recommend a movie based on my
interests.Agent:
Output:
Sorry, I don't have any information about your interests. However,
here's a list of the top global trending movies right now: [list of
movies]. I hope you find something you like!
Prompting Techniques
By this point, it should be obvious that it helps to improve prompts to
get better results on different tasks. That's the whole idea behind
prompt engineering.
While the basic examples were fun, in this section we cover more
advanced prompting engineering techniques that allow us to achieve more
complex and interesting tasks.
Zero-Shot Prompting
Large LLMs today, such as GPT-3, are tuned to follow instructions and
are trained on large amounts of data; so they are capable of performing
some tasks "zero-shot."
We tried a few zero-shot examples in the previous section. Here is one
of the examples we used:
Prompt:
Classify the text into neutral, negative or positive. Text: I think the
vacation is okay.Sentiment:
Output:
Neutral
Note that in the prompt above we didn't provide the model with any
examples of text alongside their classifications, the LLM already
understands "sentiment" -- that's the zero-shot capabilities at
work.

Instruction tuning has shown to improve zero-shot learning Wei et al.
(2022)(opens in a new tab).
Instruction tuning is essentially the concept of finetuning models on
datasets described via instructions. Furthermore, RLHF(opens in a new
tab) (reinforcement learning from
human feedback) has been adopted to scale instruction tuning wherein the
model is aligned to better fit human preferences. This recent
development powers models like ChatGPT. We will discuss all these
approaches and methods in upcoming sections.
When zero-shot doesn't work, it's recommended to provide
demonstrations or examples in the prompt which leads to few-shot
prompting. In the next section, we demonstrate few-shot prompting.
Few-Shot Prompting
While large-language models demonstrate remarkable zero-shot
capabilities, they still fall short on more complex tasks when using the
zero-shot setting. Few-shot prompting can be used as a technique to
enable in-context learning where we provide demonstrations in the prompt
to steer the model to better performance. The demonstrations serve as
conditioning for subsequent examples where we would like the model to
generate a response.
According to Touvron et al. 2023[(opens in a new
tab)]{.underline} few shot
properties first appeared when models were scaled to a sufficient
size (Kaplan et al., 2020)[(opens in a new
tab)]{.underline}.
Let's demonstrate few-shot prompting via an example that was presented
in Brown et al. 2020[(opens in a new
tab)]{.underline}. In the example,
the task is to correctly use a new word in a sentence.
Prompt:
A "whatpu" is a small, furry animal native to Tanzania. An example of
a sentence that usesthe word whatpu is:We were traveling in Africa and
we saw these very cute whatpus.To do a "farduddle" means to jump up
and down really fast. An example of a sentence that usesthe word
farduddle is:

Output:
When we won the game, we all started to farduddle in celebration.
We can observe that the model has somehow learned how to perform the
task by providing it with just one example (i.e., 1-shot). For more
difficult tasks, we can experiment with increasing the demonstrations
(e.g., 3-shot, 5-shot, 10-shot, etc.).
Following the findings from Min et al. (2022)[(opens in a new
tab)]{.underline}, here are a few
more tips about demonstrations/exemplars when doing few-shot:
• "the label space and the distribution of the input text specified
by the demonstrations are both important (regardless of whether the
labels are correct for individual inputs)"
• the format you use also plays a key role in performance, even if you
just use random labels, this is much better than no labels at all.
• additional results show that selecting random labels from a true
distribution of labels (instead of a uniform distribution) also
helps.
Let's try out a few examples. Let's first try an example with random
labels (meaning the labels Negative and Positive are randomly assigned
to the inputs):
Prompt:
This is awesome! // NegativeThis is bad! // PositiveWow that movie was
rad! // PositiveWhat a horrible show! //
Output:
Negative
We still get the correct answer, even though the labels have been
randomized. Note that we also kept the format, which helps too. In fact,
with further experimentation, it seems the newer GPT models we are
experimenting with are becoming more robust to even random formats.
Example:
Prompt:
Positive This is awesome! This is bad! NegativeWow that movie was
rad!PositiveWhat a horrible show! --

Output:
Negative
There is no consistency in the format above but the model still
predicted the correct label. We have to conduct a more thorough analysis
to confirm if this holds for different and more complex tasks, including
different variations of prompts.
Limitations of Few-shot Prompting
Standard few-shot prompting works well for many tasks but is still not a
perfect technique, especially when dealing with more complex reasoning
tasks. Let's demonstrate why this is the case. Do you recall the
previous example where we provided the following task:
The odd numbers in this group add up to an even number: 15, 32, 5, 13,
82, 7, 1. A:
If we try this again, the model outputs the following:
Yes, the odd numbers in this group add up to 107, which is an even
number.
This is not the correct response, which not only highlights the
limitations of these systems but that there is a need for more advanced
prompt engineering.
Let's try to add some examples to see if few-shot prompting improves
the results.
Prompt:
The odd numbers in this group add up to an even number: 4, 8, 9, 15, 12,
2, 1.A: The answer is False.The odd numbers in this group add up to an
even number: 17, 10, 19, 4, 8, 12, 24.A: The answer is True.The odd
numbers in this group add up to an even number: 16, 11, 14, 4, 8, 13,
24.A: The answer is True.The odd numbers in this group add up to an even
number: 17, 9, 10, 12, 13, 4, 2.A: The answer is False.The odd numbers
in this group add up to an even number: 15, 32, 5, 13, 82, 7, 1. A:
Output:
The answer is True.
That didn't work. It seems like few-shot prompting is not enough to get
reliable responses for this type of reasoning problem. The example above

provides basic information on the task. If you take a closer look, the
type of task we have introduced involves a few more reasoning steps. In
other words, it might help if we break the problem down into steps and
demonstrate that to the model. More recently, chain-of-thought (CoT)
prompting[(opens in a new
tab)]{.underline} has been
popularized to address more complex arithmetic, commonsense, and
symbolic reasoning tasks.
Overall, it seems that providing examples is useful for solving some
tasks. When zero-shot prompting and few-shot prompting are not
sufficient, it might mean that whatever was learned by the model isn't
enough to do well at the task. From here it is recommended to start
thinking about fine-tuning your models or experimenting with more
advanced prompting techniques. Up next we talk about one of the popular
prompting techniques called chain-of-thought prompting which has gained
a lot of popularity.
Chain-of-Thought (CoT) Prompting
{width="6.6930555555555555in"
height="3.3680555555555554in"}
Image Source: Wei et al. (2022)[(opens in a new
tab)]{.underline}
Introduced in Wei et al. (2022)[(opens in a new
tab)]{.underline}, chain-of-thought
(CoT) prompting enables complex reasoning capabilities through
intermediate reasoning steps. You can combine it with few-shot prompting
to get better results on more complex tasks that require reasoning
before responding.
Prompt:
The odd numbers in this group add up to an even number: 4, 8, 9, 15, 12,
2, 1.A: Adding all the odd numbers (9, 15, 1) gives 25. The answer is
False.The odd numbers in this group add up to an even number: 17, 10,
19, 4, 8, 12, 24.A: Adding all the odd numbers (17, 19) gives 36. The
answer is True.The odd numbers in this group add up to an even number:
16, 11, 14, 4, 8, 13, 24.A: Adding all the odd numbers (11, 13) gives
24. The answer is True.The odd numbers in this group add up to an even

number: 17, 9, 10, 12, 13, 4, 2.A: Adding all the odd numbers (17, 9,
13) gives 39. The answer is False.The odd numbers in this group add up
to an even number: 15, 32, 5, 13, 82, 7, 1. A:
Output:
Adding all the odd numbers (15, 5, 13, 7, 1) gives 41. The answer is
False.
Wow! We can see a perfect result when we provided the reasoning step. In
fact, we can solve this task by providing even fewer examples, i.e.,
just one example seems enough:
Prompt:
The odd numbers in this group add up to an even number: 4, 8, 9, 15, 12,
2, 1.A: Adding all the odd numbers (9, 15, 1) gives 25. The answer is
False.The odd numbers in this group add up to an even number: 15, 32, 5,
13, 82, 7, 1. A:
Output:
Adding all the odd numbers (15, 5, 13, 7, 1) gives 41. The answer is
False.
Keep in mind that the authors claim that this is an emergent ability
that arises with sufficiently large language models.
Zero-shot COT Prompting
{width="6.6930555555555555in"
height="3.6020833333333333in"}
Image Source: Kojima et al. (2022)[(opens in a new
tab)]{.underline}
One recent idea that came out more recently is the idea of zero-shot
CoT[(opens in a new
tab)]{.underline} (Kojima et al.
2022) that essentially involves adding "Let's think step by step" to
the original prompt. Let's try a simple problem and see how the model
performs:
Prompt:

I went to the market and bought 10 apples. I gave 2 apples to the
neighbor and 2 to the repairman. I then went and bought 5 more apples
and ate 1. How many apples did I remain with?
Output:
11 apples
The answer is incorrect! Now Let's try with the special prompt.
Prompt:
I went to the market and bought 10 apples. I gave 2 apples to the
neighbor and 2 to the repairman. I then went and bought 5 more apples
and ate 1. How many apples did I remain with?Let's think step by step.
Output:
First, you started with 10 apples.You gave away 2 apples to the neighbor
and 2 to the repairman, so you had 6 apples left.Then you bought 5 more
apples, so now you had 11 apples.Finally, you ate 1 apple, so you would
remain with 10 apples.
It's impressive that this simple prompt is effective at this task. This
is particularly useful where you don't have too many examples to use in
the prompt.
Automatic Chain-of-Thought (Auto-CoT)
When applying chain-of-thought prompting with demonstrations, the
process involves hand-crafting effective and diverse examples. This
manual effort could lead to suboptimal solutions. Zhang et al.
(2022)[(opens in a new
tab)]{.underline} propose an approach
to eliminate manual efforts by leveraging LLMs with "Let's think step
by step" prompt to generate reasoning chains for demonstrations one by
one. This automatic process can still end up with mistakes in generated
chains. To mitigate the effects of the mistakes, the diversity of
demonstrations matter. This works proposes Auto-CoT, which samples
questions with diversity and generates reasoning chains to construct the
demonstrations.
Auto-CoT consists of two main stages:
• Stage 1): question clustering: partition questions of a given
dataset into a few clusters

• Stage 2): demonstration sampling: select a representative
question from each cluster and generate its reasoning chain using
Zero-Shot-CoT with simple heuristics
The simple heuristics could be length of questions (e.g., 60 tokens) and
number of steps in rationale (e.g., 5 reasoning steps). This encourages
the model to use simple and accurate demonstrations.
The process is illustrated below:
{width="6.6930555555555555in"
height="3.6444444444444444in"}
Self-Consistency
Perhaps one of the more advanced techniques out there for prompt
engineering is self-consistency. Proposed by Wang et al. (2022)[(opens
in a new tab)]{.underline},
self-consistency aims "to replace the naive greedy decoding used in
chain-of-thought prompting". The idea is to sample multiple, diverse
reasoning paths through few-shot CoT, and use the generations to select
the most consistent answer. This helps to boost the performance of CoT
prompting on tasks involving arithmetic and commonsense reasoning.
Let's try the following example for arithmetic reasoning:
Prompt:
When I was 6 my sister was half my age. NowI'm 70 how old is my sister?
Output:
35
The output is wrong! How may we improve this with self-consistency?
Let's try it out. We will use the few-shot exemplars from Wang et al.
2022 (Table 17):
Prompt:
Q: There are 15 trees in the grove. Grove workers will plant trees in
the grove today. After they are done,there will be 21 trees. How many
trees did the grove workers plant today?A: We start with 15 trees. Later
we have 21 trees. The difference must be the number of trees they
planted.So, they must have planted 21 - 15 = 6 trees. The answer is 6.Q:

If there are 3 cars in the parking lot and 2 more cars arrive, how many
cars are in the parking lot?A: There are 3 cars in the parking lot
already. 2 more arrive. Now there are 3 + 2 = 5 cars. The answer is 5.Q:
Leah had 32 chocolates and her sister had 42. If they ate 35, how many
pieces do they have left in total?A: Leah had 32 chocolates and Leah's
sister had 42. That means there were originally 32 + 42 = 74chocolates.
35 have been eaten. So in total they still have 74 - 35 = 39 chocolates.
The answer is 39.Q: Jason had 20 lollipops. He gave Denny some
lollipops. Now Jason has 12 lollipops. How many lollipopsdid Jason give
to Denny?A: Jason had 20 lollipops. Since he only has 12 now, he must
have given the rest to Denny. The number oflollipops he has given to
Denny must have been 20 - 12 = 8 lollipops. The answer is 8.Q: Shawn has
five toys. For Christmas, he got two toys each from his mom and dad. How
many toys doeshe have now?A: He has 5 toys. He got 2 from mom, so after
that he has 5 + 2 = 7 toys. Then he got 2 more from dad, soin total he
has 7 + 2 = 9 toys. The answer is 9.Q: There were nine computers in the
server room. Five more computers were installed each day, frommonday to
thursday. How many computers are now in the server room?A: There are 4
days from monday to thursday. 5 computers were added each day. That
means in total 4 * 5 =20 computers were added. There were 9 computers
in the beginning, so now there are 9 + 20 = 29 computers.The answer is
29.Q: Michael had 58 golf balls. On tuesday, he lost 23 golf balls. On
wednesday, he lost 2 more. How manygolf balls did he have at the end of
wednesday?A: Michael initially had 58 balls. He lost 23 on Tuesday, so
after that he has 58 - 23 = 35 balls. OnWednesday he lost 2 more so now
he has 35 - 2 = 33 balls. The answer is 33.Q: Olivia has $23. She
bought five bagels for $3 each. How much money does she have left?A:
She bought 5 bagels for $3 each. This means she spent $15. She has $8
left.Q: When I was 6 my sister was half my age. Now I'm 70 how old is my
sister?A:
Output 1:
When I was 6 my sister was half my age, so she was 3. Now I am 70, so
she is 70 - 3 = 67. The answer is 67.
Output 2:
When the narrator was 6, his sister was half his age, which is 3. Now
that the narrator is 70, his sister would be 70 - 3 = 67 years old. The
answer is 67.

Output 3:
When I was 6 my sister was half my age, so she was 3. Now I am 70, so
she is 70/2 = 35. The answer is 35.
Computing for the final answer involves a few steps (check out the paper
for the details) but for the sake of simplicity, we can see that there
is already a majority answer emerging so that would essentially become
the final answer.
Generated Knowledge Prompting
{width="6.6930555555555555in"
height="4.313194444444444in"}
Image Source: [Liu et al. 2022(opens in a new
tab)]{.underline}
LLMs continue to be improved and one popular technique includes the
ability to incorporate knowledge or information to help the model make
more accurate predictions.
Using a similar idea, can the model also be used to generate knowledge
before making a prediction? That's what is attempted in the paper
by [Liu et al. 2022(opens in a new
tab)]{.underline} -- generate
knowledge to be used as part of the prompt. In particular, how helpful
is this for tasks such as commonsense reasoning?
Let's try a simple prompt:
Prompt:
Part of golf is trying to get a higher point total than others. Yes or
No?
Output:
Yes.
This type of mistake reveals the limitations of LLMs to perform tasks
that require more knowledge about the world. How do we improve this with
knowledge generation?
First, we generate a few "knowledges":

Prompt:
Input: Greece is larger than mexico.Knowledge: Greece is approximately
131,957 sq km, while Mexico is approximately 1,964,375 sq km, making
Mexico 1,389% larger than Greece.Input: Glasses always fog up.Knowledge:
Condensation occurs on eyeglass lenses when water vapor from your sweat,
breath, and ambient humidity lands on a cold surface, cools, and then
changes into tiny drops of liquid, forming a film that you see as fog.
Your lenses will be relatively cool compared to your breath, especially
when the outside air is cold.Input: A fish is capable of
thinking.Knowledge: Fish are more intelligent than they appear. In many
areas, such as memory, their cognitive powers match or exceed those of
'higher' vertebrates including non-human primates. Fish's long-term
memories help them keep track of complex social relationships.Input: A
common effect of smoking lots of cigarettes in one's lifetime is a
higher than normal chance of getting lung cancer.Knowledge: Those who
consistently averaged less than one cigarette per day over their
lifetime had nine times the risk of dying from lung cancer than never
smokers. Among people who smoked between one and 10 cigarettes per day,
the risk of dying from lung cancer was nearly 12 times higher than that
of never smokers.Input: A rock is the same size as a pebble.Knowledge: A
pebble is a clast of rock with a particle size of 4 to 64 millimetres
based on the Udden-Wentworth scale of sedimentology. Pebbles are
generally considered larger than granules (2 to 4 millimetres diameter)
and smaller than cobbles (64 to 256 millimetres diameter).Input: Part of
golf is trying to get a higher point total than others.Knowledge:
Knowledge 1:
The objective of golf is to play a set of holes in the least number of
strokes. A round of golf typically consists of 18 holes. Each hole is
played once in the round on a standard golf course. Each stroke is
counted as one point, and the total number of strokes is used to
determine the winner of the game.
Knowledge 2:
Golf is a precision club-and-ball sport in which competing players (or
golfers) use many types of clubs to hit balls into a series of holes on
a course using the fewest number of strokes. The goal is to complete the
course with the lowest score, which is calculated by adding up the total

number of strokes taken on each hole. The player with the lowest score
wins the game.
We are using the prompt provided in the paper by [Liu et al. 2022(opens
in a new tab)]{.underline}.
The next step is to integrate the knowledge and get a prediction. I
reformatted the question into QA format to guide the answer format.
Prompt:
Question: Part of golf is trying to get a higher point total than
others. Yes or No?Knowledge: The objective of golf is to play a set of
holes in the least number of strokes. A round of golf typically consists
of 18 holes. Each hole is played once in the round on a standard golf
course. Each stroke is counted as one point, and the total number of
strokes is used to determine the winner of the game.Explain and Answer:
Answer 1 (confidence very high):
No, the objective of golf is not to get a higher point total than
others. Rather, the objective is to play a set of holes in the least
number of strokes. The total number of strokes is used to determine the
winner of the game, not the total number of points.
Question: Part of golf is trying to get a higher point total than
others. Yes or No?Knowledge: Golf is a precision club-and-ball sport in
which competing players (or golfers) use many types of clubs to hit
balls into a series of holes on a course using the fewest number of
strokes. The goal is to complete the course with the lowest score, which
is calculated by adding up the total number of strokes taken on each
hole. The player with the lowest score wins the game.Explain and Answer:
Answer 2 (confidence is a lot lower):
Yes, part of golf is trying to get a higher point total than others.
Each player tries to complete the course with the lowest score, which is
calculated by adding up the total number of strokes taken on each hole.
The player with the lowest score wins the game.
Some really interesting things happened with this example. In the first answer, the model
was very confident but in the second not so much. I simplify the process for
demonstration purposes but there are a few more details to consider when arriving at the
final answer. Tree of Thoughts (ToT)

For complex tasks that require exploration or strategic lookahead,
traditional or simple prompting techniques fall short. [Yao et el.
(2023)(opens in a new
tab)]{.underline} and [Long
(2023)(opens in a new
tab)]{.underline} recently proposed
Tree of Thoughts (ToT), a framework that generalizes over
chain-of-thought prompting and encourages exploration over thoughts that
serve as intermediate steps for general problem solving with language
models.
ToT maintains a tree of thoughts, where thoughts represent coherent
language sequences that serve as intermediate steps toward solving a
problem. This approach enables an LM to self-evaluate the progress
intermediate thoughts make towards solving a problem through a
deliberate reasoning process. The LM's ability to generate and evaluate
thoughts is then combined with search algorithms (e.g., breadth-first
search and depth-first search) to enable systematic exploration of
thoughts with lookahead and backtracking.
The ToT framework is illustrated below:
{width="6.6930555555555555in"
height="3.3993055555555554in"}
Image Source: [Yao et el. (2023)(opens in a new
tab)]{.underline}
When using ToT, different tasks requires defining the number of
candidates and the number of thoughts/steps. For instance, as
demonstrated in the paper, Game of 24 is used as a mathematical
reasoning task which requires decomposing the thoughts into 3 steps,
each involving an intermediate equation. At each step, the best b=5
candidates are kept.
To perform BFS in ToT for the Game of 24 task, the LM is prompted to
evaluate each thought candidate as "sure/maybe/impossible" with regard
to reaching 24. As stated by the authors, "the aim is to promote
correct partial solutions that can be verdicted within few lookahead
trials, and eliminate impossible partial solutions based on "too
big/small" commonsense, and keep the rest "maybe"". Values are
sampled 3 times for each thought. The process is illustrated below:

{width="6.6930555555555555in"
height="1.9326388888888888in"}
Image Source: [Yao et el. (2023)(opens in a new
tab)]{.underline}
From the results reported in the figure below, ToT substantially
outperforms the other prompting methods:
{width="6.6930555555555555in"
height="2.5590277777777777in"}
Image Source: [Yao et el. (2023)(opens in a new
tab)]{.underline}
Code available [here(opens in a new
tab)]{.underline} and [here(opens
in a new
tab)]{.underline}
At a high level, the main ideas of [Yao et el. (2023)(opens in a new
tab)]{.underline} and [Long
(2023)(opens in a new
tab)]{.underline} are similar. Both
enhance LLM's capability for complex problem solving through tree
search via a multi-round conversation. One of the main difference is
that [Yao et el. (2023)(opens in a new
tab)]{.underline} leverages
DFS/BFS/beam search, while the tree search strategy (i.e. when to
backtrack and backtracking by how many levels, etc.) proposed in [Long
(2023)(opens in a new
tab)]{.underline} is driven by a
"ToT Controller" trained through reinforcement learning. DFS/BFS/Beam
search are generic solution search strategies with no adaptation to
specific problems. In comparison, a ToT Controller trained through RL
might be able learn from new data set or through self-play (AlphaGo vs
brute force search), and hence the RL-based ToT system can continue to
evolve and learn new knowledge even with a fixed LLM.
[Hulbert (2023)(opens in a new
tab)]{.underline} has

proposed Tree-of-Thought Prompting, which applies the main concept from
ToT frameworks as a simple prompting technique, getting the LLM to
evaluate intermediate thoughts in a single prompt. A sample ToT prompt
is:
Imagine three different experts are answering this question.All experts
will write down 1 step of their thinking,then share it with the
group.Then all experts will go on to the next step, etc.If any expert
realises they're wrong at any point then they leave.The question is...
[Sun (2023)(opens in a new
tab)]{.underline} benchmarked
the Tree-of-Thought Prompting with large-scale experiments, and
introduce PanelGPT --- an idea of prompting with Panel discussions
among LLMs.
Automatic Reasoning and Tool-use (ART)
Combining CoT prompting and tools in an interleaved manner has shown to
be a strong and robust approach to address many tasks with LLMs. These
approaches typically require hand-crafting task-specific demonstrations
and carefully scripted interleaving of model generations with tool
use. [Paranjape et al., (2023)(opens in a new
tab)]{.underline} propose a new
framework that uses a frozen LLM to automatically generate intermediate
reasoning steps as a program.
ART works as follows:
• given a new task, it select demonstrations of multi-step reasoning
and tool use from a task library
• at test time, it pauses generation whenever external tools are
called, and integrate their output before resuming generation
ART encourages the model to generalize from demonstrations to decompose
a new task and use tools in appropriate places, in a zero-shot fashion.
In addition, ART is extensible as it also enables humans to fix mistakes
in the reasoning steps or add new tools by simply updating the task and
tool libraries. The process is demonstrated below:
{width="5.71875in" height="8.114583333333334in"}

Image Source: [Paranjape et al., (2023)(opens in a new
tab)]{.underline}
ART substantially improves over few-shot prompting and automatic CoT on
unseen tasks in the BigBench and MMLU benchmarks, and exceeds
performance of hand-crafted CoT prompts when human feedback is
incorporated.
Below is a table demonstrating ART's performance on BigBench and MMLU
tasks:
{width="6.6930555555555555in"
height="6.7444444444444445in"}
Automatic Prompt Engineer (APE)
{width="6.6930555555555555in"
height="4.504861111111111in"}
Image Source: [Zhou et al., (2022)(opens in a new
tab)]{.underline}
[Zhou et al., (2022)(opens in a new
tab)]{.underline} propose automatic
prompt engineer (APE) a framework for automatic instruction generation
and selection. The instruction generation problem is framed as natural
language synthesis addressed as a black-box optimization problem using
LLMs to generate and search over candidate solutions.
The first step involves a large language model (as an inference model)
that is given output demonstrations to generate instruction candidates
for a task. These candidate solutions will guide the search procedure.
The instructions are executed using a target model, and then the most
appropriate instruction is selected based on computed evaluation scores.
APE discovers a better zero-shot CoT prompt than the human engineered
"Let's think step by step" prompt ([Kojima et al., 2022(opens in a
new tab)]{.underline}).
The prompt "Let's work this out in a step by step way to be sure we
have the right answer." elicits chain-of-thought reasoning and improves
performance on the MultiArith and GSM8K benchmarks:

{width="6.6930555555555555in"
height="3.5145833333333334in"}
Image Source: [Zhou et al., (2022)(opens in a new
tab)]{.underline}
This paper touches on an important topic related to prompt engineering
which is the idea of automatically optimizing prompts. While we don't
go deep into this topic in this guide, here are a few key papers if you
are interested in the topic:
• [Prompt-OIRL(opens in a new
tab)]{.underline} - proposes to
use offline inverse reinforcement learning to generate
query-dependent prompts.
• [OPRO(opens in a new
tab)]{.underline} - introduces
the idea of using LLMs to optimize prompts: let LLMs "Take a deep
breath" improves the performance on math problems.
• [AutoPrompt(opens in a new
tab)]{.underline} - proposes an
approach to automatically create prompts for a diverse set of tasks
based on gradient-guided search.
• [Prefix Tuning(opens in a new
tab)]{.underline} - a lightweight
alternative to fine-tuning that prepends a trainable continuous
prefix for NLG tasks.
• [Prompt Tuning(opens in a new
tab)]{.underline} - proposes a
mechanism for learning soft prompts through backpropagation.
• Active-Prompt
• Chain-of-thought (CoT) methods rely on a fixed set of
human-annotated exemplars. The problem with this is that the
exemplars might not be the most effective examples for the different
tasks. To address this, [Diao et al., (2023)(opens in a new
tab)]{.underline} recently
proposed a new prompting approach called Active-Prompt to adapt LLMs

to different task-specific example prompts (annotated with
human-designed CoT reasoning).
• Below is an illustration of the approach. The first step is to query
the LLM with or without a few CoT examples. k possible answers are
generated for a set of training questions. An uncertainty metric is
calculated based on the k answers (disagreement used). The most
uncertain questions are selected for annotation by humans. The new
annotated exemplars are then used to infer each question.
• {width="6.6930555555555555in"
height="3.3673611111111112in"}
• Directional Stimulus Prompting
• [Li et al., (2023)(opens in a new
tab)]{.underline} proposes a new
prompting technique to better guide the LLM in generating the
desired summary.
• A tuneable policy LM is trained to generate the stimulus/hint.
Seeing more use of RL to optimize LLMs.
• The figure below shows how Directional Stimulus Prompting compares
with standard prompting. The policy LM can be small and optimized to
generate the hints that guide a black-box frozen LLM.
• {width="6.6930555555555555in"
height="4.040972222222222in"}
ReAct Prompting
Yao et al., 2022[(opens in a new
tab)]{.underline} introduced a
framework named ReAct where LLMs are used to generate both reasoning
traces and task-specific actions in an interleaved manner.
Generating reasoning traces allow the model to induce, track, and update
action plans, and even handle exceptions. The action step allows to
interface with and gather information from external sources such as
knowledge bases or environments.

The ReAct framework can allow LLMs to interact with external tools to
retrieve additional information that leads to more reliable and factual
responses.
Results show that ReAct can outperform several state-of-the-art
baselines on language and decision-making tasks. ReAct also leads to
improved human interpretability and trustworthiness of LLMs. Overall,
the authors found that best approach uses ReAct combined with
chain-of-thought (CoT) that allows use of both internal knowledge and
external information obtained during reasoning.
How it Works?
ReAct is inspired by the synergies between "acting" and "reasoning"
which allow humans to learn new tasks and make decisions or reasoning.
Chain-of-thought (CoT) prompting has shown the capabilities of LLMs to
carry out reasoning traces to generate answers to questions involving
arithmetic and commonsense reasoning, among other tasks (Wei et al.,
2022)[(opens in a new
tab)]{.underline}. But it's lack of
access to the external world or inability to update its knowledge can
lead to issues like fact hallucination and error propagation.
ReAct is a general paradigm that combines reasoning and acting with
LLMs. ReAct prompts LLMs to generate verbal reasoning traces and actions
for a task. This allows the system to perform dynamic reasoning to
create, maintain, and adjust plans for acting while also enabling
interaction to external environments (e.g., Wikipedia) to incorporate
additional information into the reasoning. The figure below shows an
example of ReAct and the different steps involved to perform question
answering.
{width="6.6930555555555555in"
height="5.719444444444444in"}
Image Source: Yao et al., 2022[(opens in a new
tab)]{.underline}
In the example above, we pass a prompt like the following question
from HotpotQA[(opens in a new
tab)]{.underline}:

Aside from the Apple Remote, what other devices can control the program
Apple Remote was originally designed to interact with?
Note that in-context examples are also added to the prompt but we
exclude that here for simplicity. We can see that the model
generates task solving trajectories (Thought, Act). Obs corresponds to
observation from the environment that's being interacted with (e.g.,
Search engine). In essence, ReAct can retrieve information to support
reasoning, while reasoning helps to target what to retrieve next.
ReAct Prompting
To demonstrate how ReAct prompting works, let's follow an example from
the paper.
The first step is to select cases from a training set (e.g., HotPotQA)
and compose ReAct-format trajectories. These are used as few-shot
exemplars in the prompts. The trajectories consist of multiple
thought-action-observation steps as shown in the figure above. The
free-form thoughts are used to achieve different tasks such as
decomposing questions, extracting information, performing
commonsense/arithmetic reasoning, guide search formulation, and
synthesizing final answer.
Here is an example of what the ReAct prompt exemplars look like
(obtained from the paper and shortened to one example for simplicity):
Question What is the elevation range for the area that the eastern
sector of theColorado orogeny extends into?Thought 1 I need to search
Colorado orogeny, find the area that the eastern sectorof the Colorado
orogeny extends into, then find the elevation range of thearea.Action 1
Search[Colorado orogeny]Observation 1 The Colorado orogeny was an
episode of mountain building (an orogeny) inColorado and surrounding
areas.Thought 2 It does not mention the eastern sector. So I need to
look up easternsector.Action 2 Lookup[eastern sector]Observation 2
(Result 1 / 1) The eastern sector extends into the High Plains and is
calledthe Central Plains orogeny.Thought 3 The eastern sector of
Colorado orogeny extends into the High Plains. So Ineed to search High
Plains and find its elevation range.Action 3 Search[High
Plains]Observation 3 High Plains refers to one of two distinct land
regionsThought 4 I need to instead search High Plains (United
States).Action 4 Search[High Plains (United States)]Observation 4 The

High Plains are a subregion of the Great Plains. From east to west,
theHigh Plains rise in elevation from around 1,800 to 7,000 ft (550 to
2,130m).[3]Thought 5 High Plains rise in elevation from around 1,800
to 7,000 ft, so the answeris 1,800 to 7,000 ft.Action 5 Finish[1,800 to
7,000 ft]...
Note that different prompts setups are used for different types of
tasks. For tasks where reasoning is of primary importance (e.g.,
HotpotQA), multiple thought-action-observation steps are used for the
task-solving trajectory. For decision making tasks involving lots of
action steps, thoughts are used sparsely.
Results on Knowledge-Intensive Tasks
The paper first evaluates ReAct on knowledge-intensive reasoning tasks
such as question answering (HotPotQA) and fact verification
(Fever[(opens in a new
tab)]{.underline}). PaLM-540B is used
as the base model for prompting.
{width="6.6930555555555555in"
height="4.379861111111111in"}
Image Source: Yao et al., 2022[(opens in a new
tab)]{.underline}
The prompting results on HotPotQA and Fever using different prompting
methods show that ReAct generally performs better than Act (involves
acting only) on both tasks.
We can also observe that ReAct outperforms CoT on Fever and lags behind
CoT on HotpotQA. A detailed error analysis is provided in the paper. In
summary:
• CoT suffers from fact hallucination
• ReAct's structural constraint reduces its flexibility in
formulating reasoning steps
• ReAct depends a lot on the information it's retrieving;
non-informative search results derails the model reasoning and leads
to difficulty in recovering and reformulating thoughts

Prompting methods that combine and support switching between ReAct and
CoT+Self-Consistency generally outperform all the other prompting
methods.
Results on Decision Making Tasks
The paper also reports results demonstrating ReAct's performance on
decision making tasks. ReAct is evaluated on two benchmarks
called ALFWorld[(opens in a new
tab)]{.underline} (text-based game)
and WebShop[(opens in a new
tab)]{.underline} (online shopping
website environment). Both involve complex environments that require
reasoning to act and explore effectively.
Note that the ReAct prompts are designed differently for these tasks
while still keeping the same core idea of combining reasoning and
acting. Below is an example for an ALFWorld problem involving ReAct
prompting.
{width="6.6930555555555555in"
height="5.264583333333333in"}
Image Source: Yao et al., 2022[(opens in a new
tab)]{.underline}
ReAct outperforms Act on both ALFWorld and Webshop. Act, without any
thoughts, fails to correctly decompose goals into subgoals. Reasoning
seems to be advantageous in ReAct for these types of tasks but current
prompting-based methods are still far from the performance of expert
humans on these tasks.
Check out the paper for more detailed results.
LangChain ReAct Usage
Below is a high-level example of how the ReAct prompting approach works
in practice. We will be using OpenAI for the LLM and LangChain[(opens
in a new
tab)]{.underline} as
it already has built-in functionality that leverages the ReAct framework
to build agents that perform tasks by combining the power of LLMs and
different tools.

First, let's install and import the necessary libraries:
%%capture# update or install the necessary libraries!pip install
--upgrade openai!pip install --upgrade langchain!pip install
--upgrade python-dotenv!pip install google-search-results # import
librariesimport openaiimport osfrom langchain.llms import OpenAIfrom
langchain.agents import load_toolsfrom langchain.agents import
initialize_agentfrom dotenv import load_dotenvload_dotenv() # load API
keys; you will need to obtain these if you haven't
yetos.environ["OPENAI_API_KEY"] =
os.getenv("OPENAI_API_KEY")os.environ["SERPER_API_KEY"] =
os.getenv("SERPER_API_KEY")
Now we can configure the LLM, the tools we will use, and the agent that
allows us to leverage the ReAct framework together with the LLM and
tools. Note that we are using a search API for searching external
information and LLM as a math tool.
llm = OpenAI(model_name="text-davinci-003" ,temperature=0)tools =
load_tools(["google-serper", "llm-math"], llm=llm)agent =
initialize_agent(tools, llm, agent="zero-shot-react-description",
verbose=True)
Once that's configured, we can now run the agent with the desired
query/prompt. Notice that here we are not expected to provide few-shot
exemplars as explained in the paper.
agent.run("Who is Olivia Wilde's boyfriend? What is his current age
raised to the 0.23 power?")
The chain execution looks as follows:
> Entering new AgentExecutor chain... I need to find out who Olivia
Wilde's boyfriend is and then calculate his age raised to the 0.23
power.Action: SearchAction Input: "Olivia Wilde boyfriend"Observation:
Olivia Wilde started dating Harry Styles after ending her years-long
engagement to Jason Sudeikis --- see their relationship
timeline.Thought: I need to find out Harry Styles' age.Action:
SearchAction Input: "Harry Styles age"Observation: 29 yearsThought: I
need to calculate 29 raised to the 0.23 power.Action: CalculatorAction
Input: 29^0.23Observation: Answer: 2.169459462491557 Thought: I now
know the final answer.Final Answer: Harry Styles, Olivia Wilde's

boyfriend, is 29 years old and his age raised to the 0.23 power is
2.169459462491557. > Finished chain.
The output we get is as follows:
"Harry Styles, Olivia Wilde's boyfriend, is 29 years old and his age
raised to the 0.23 power is 2.169459462491557."
We adapted the example from the LangChain documentation[(opens in a new
tab)]{.underline},
so credit goes to them. We encourage the learner to explore different
combination of tools and tasks.
There have been many papers such as "Take a Deep Breath" "Step Back"
and "Let's think through this step by step" and I noticed that no one
has yet generalized what's going on with the models. Why do these
techniques work and how can you generalize them more broadly?
This repo is here to demonstrate a few techniques that you can use to
activate latent space (embedded knowledge and abilities within the
models).
The first thing to know is that LLMs have vast amounts of knowledge and
capabilities embedded in the networks. Most people seem to expect them
to magically pop out correct answers and abilities on the first go with
inadequate context. But this is setting the bar way higher than human
intelligence. What most ML scientists don't know about the brain is
that there are hundreds (if not thousands) of parallel processes and
sequences that spool up correct answers. Not only that, the longer you
work on a problem, the more relevant information gets recruited into
"working memory". This can be approximated with iterative retrieval or
activation of latent knowledge. Furthermore, the LLM "knows" how to
tackle many problems, but like humans, it helps to stop and think for a
moment about how to address a problem.
This is the nature of my work on cognitive architecture - how to create
patterns that can do all this automatically without needing manual
prompts. However, in order to get consistent performance in a more
straightforward manner, you can also use static prompts.
Technique 1: Iterative Dialog
Ever "talk through a problem" to yourself? Either out loud or in your
head? What you're doing here is using several neurocognitive techniques

to prime your brain to recall relevant facts and procedures to solve a
problem or answer a question. Let's lay out a series of possible
questions that you might use to approach any such problem and then
demonstrate how you can use the ChatGPT API, with it's intrinsic dialog
handling capabilities, to approximate the same:
Main Question: Who was emperor during the absolute apogee of Roman
power?
Dialog 1: Well, first I need to think about Rome in general. What do I
know about Rome that is relevant?
Dialog 2: Next, maybe I need to figure out how I define the answer. What
criteria am I looking to judge on?
Dialog 3: Based on all this, what can I answer?
You can see this method implemented in the first
experiment technique01_dialog.py. To use this, just run it, ask a
question, and you will see the internal dialog process. This is aided
by system01_dialog.txt which is not strictly necessary - you could
simply use prompt chaining and an ordinary conversation to achieve the
same or similar results.
ChatGPT_Custom_Instructions
Each file has a brief description and the SYSTEM prompt (custom
instructions).
To use these, just copy the block of text into the Custom Instructions
in your ChatGPT app.
General Structure
You can write your own. This is the general pattern I follow. You can
pick and choose whatever you want.
# Mission
- Outcome or goal
- Not procedure
# Context
- Background info
- Where in the process are you

- Why does it need to be done
# Rules
- Boundaries and constraints
- Specific subgoals and objectives
# Instructions
- Do X, Y, and Z
# Expected Input
- What to anticipate and why
- Variability
# Output Format
- Formatting, type of output, length
- JSON, XML, lists, etc
# Example Output
- Simple demonstration
Sparse Priming Representation
There are only a handful of ways to "teach" LLMs, and all have
limitations and strengths.
1. Initial bulk training: Ludicrously expensive
2. Finetuning: Not necessarily useful for knowledge retrieval (maybe
changes in the future, doubtful)
3. Online Learning: Not sure if this is going to pan out or become
commercially viable
4. In-context Learning: Presently, the only viable solution
Because of this, RAG (retrieval augmented generation) is all the rage
right now. Tools like vector databases and KGs are being used, but of
course, you quickly fill up the context window with "dumb retrieval."
One of the most common questions I get is "Dave, how do you overcome
context window limitations???" The short answer is: YOU DON'T STOP
WASTING YOUR TIME.

There is one asterisk there, though.
Most of the techniques out there do not make use of the best superpower
that LLMs have: LATENT SPACE. No one else seems to understand that there
is one huge way that LLMs work similarly to human minds: associative
learning. Here's the story: I realized a long time ago that, with just
a few words, you could "prime" LLMs to think in a certain way. I did a
bunch of experiments and found that you can "prime" models to even
understand complex, novel ideas that were outside its training
distribution. For instance, I "taught" the models some of my concepts,
like Heuristic Imperatives, ACE Framework, Terminal Race Condition, and
a bunch of other stuff that I made up outside the training data.
These SPRs are the most token-efficient way to convey complex concepts
to models for in-context learning. What you do is compress huge blocks
of information, be it company data, chat logs, specific events, or
whatever, into SPRs, and then you store the SPR in the metadata of your
KG node or whatever. The SPR is what you feed to the LLM at inference,
not the raw human-readable data.
SPR Generator
Use this to compress any arbitrary block of text into an SPR.
# MISSION
You are a Sparse Priming Representation (SPR) writer. An SPR is a
particular kind of use of language for advanced NLP, NLU, and NLG tasks,
particularly useful for the latest generation of Large Language Models
(LLMs). You will be given information by the USER which you are to
render as an SPR.
# THEORY
LLMs are a kind of deep neural network. They have been demonstrated to
embed knowledge, abilities, and concepts, ranging from reasoning to
planning, and even to theory of mind. These are called latent abilities
and latent content, collectively referred to as latent space. The latent
space of an LLM can be activated with the correct series of words as
inputs, which will create a useful internal state of the neural network.
This is not unlike how the right shorthand cues can prime a human mind
to think in a certain way. Like human minds, LLMs are associative,

meaning you only need to use the correct associations to "prime"
another model to think in the same way.
# METHODOLOGY
Render the input as a distilled list of succinct statements, assertions,
associations, concepts, analogies, and metaphors. The idea is to capture
as much, conceptually, as possible but with as few words as possible.
Write it in a way that makes sense to you, as the future audience will
be another language model, not a human. Use complete sentences.
SPR Decompressor
Use this to reconstruct an SPR into an original.
# MISSION
You are a Sparse Priming Representation (SPR) decompressor. An SPR is a
particular kind of use of language for advanced NLP, NLU, and NLG tasks,
particularly useful for the latest generation of Large Language Models
(LLMs). You will be given an SPR and your job is to fully unpack it.
# THEORY
LLMs are a kind of deep neural network. They have been demonstrated to
embed knowledge, abilities, and concepts, ranging from reasoning to
planning, and even to theory of mind. These are called latent abilities
and latent content, collectively referred to as latent space. The latent
space of an LLM can be activated with the correct series of words as
inputs, which will create a useful internal state of the neural network.
This is not unlike how the right shorthand cues can prime a human mind
to think in a certain way. Like human minds, LLMs are associative,
meaning you only need to use the correct associations to "prime"
another model to think in the same way.
# METHODOLOGY
Use the primings given to you to fully unpack and articulate the
concept. Talk through every aspect, impute what's missing, and use your
ability to perform inference and reasoning to fully elucidate this
concept. Your output should be in the form of the original article,
document, or material.
BSHR "Basher" Loop

BSHR loop uses Large Language Models (LLMs), a type of deep neural
network based on the "transformer" architecture, to perform the
following:
1. Brainstorm: Accept user queries or information problems of
arbitrary size, length, and complexity. The LLM then brainstorms a
list of search queries, ensuring a well-rounded search by employing
information literacy and counterfactual queries. Subsequent
brainstorming loops should be informed by notes and information
accumulated over time.
2. Search: The brainstormed list of questions is used to search an
information source, such as a search API, KB database, or KG. The
search results are cached locally so that the system knows what it
has already seen. This is crucial for the BSHR loop to know when
available information has been exhausted. As with brainstorming, the
search function should improve over time with each iteration, as
there will be more cached information available.
3. Hypothesize: The LLM "reads" all the searched materials and
formulates an early hypothesis based on the user's information
needs. It does so by "taking notes", a function that LLMs excel
at. The hypothesis is recorded with citations. The hypothesis is the
iteratively refined final answer. Each version of the hypothesis
should be stored for comparison. Once the hypothesis is "good
enough" it should be rendered and the loop should exit.
4. Refine: This step is more of a recursion. The next loop performs
an "informed search" rather than a "naive search". After the
first pass of searched material and hypothesis, the next pass can
use this information to write better search queries and refine the
hypotheses. All aspects of the loop can be refined, as defined
above.
At the end of each loop, a complete function is written where the LLM
decides if the information need has been satisficed, a specific term
from information and library science. The decision is based on the
amount and quality of evidence supporting the hypothesis and whether or
not new information is available, or if the information domain has been
exhausted.
Theory

In this section, we delve into the key concepts from library and
information science that underpin the BSHR loop project. Understanding
these terms will provide a deeper insight into the project's design and
functionality.
Information Foraging
This term is inspired by the concept of food foraging in animals. In the
context of information science, it refers to the process of seeking,
gathering, and consuming information. Just as animals forage for food,
humans forage for information in their environment. The BSHR loop
project models this behavior, enabling the system to navigate through
vast information domains, identify valuable information, and make
decisions based on the gathered data.
Information Literacy
Information literacy is the ability to identify, locate, evaluate, and
effectively use information. It's a critical skill in today's digital
age where information is abundant. In the BSHR loop, the LLM employs
information literacy to brainstorm a broad list of queries, ensuring a
comprehensive and well-rounded search. It also uses this skill to
evaluate the quality of the information found and to refine the search
queries and hypotheses.
Satisficing
A term coined by Herbert Simon, a Nobel laureate in economics,
satisficing is a decision-making strategy that aims for a satisfactory
or adequate result, rather than the optimal solution. In the context of
information science, it refers to the point at which enough information
has been gathered to meet the user's needs. In the BSHR loop, the LLM
uses a variety of factors to determine if the information need has been
satisficed. These factors include the amount and quality of evidence
supporting the hypothesis and whether or not new information is
available, or if the information domain has been exhausted.
Information Needs
This term refers to the desire to obtain information to satisfy a
conscious or unconscious need. In essence, all queries are expressions
of information needs. Information needs can vary greatly in complexity,
from simple factual queries to more complex and ambiguous questions. In

the BSHR loop, the LLM accepts user queries or information problems of
arbitrary size, length, and complexity, and uses these as the starting
point for the Brainstorm, Search, Hypothesize, Refine process. The
ultimate goal of the BSHR loop is to satisfice these information needs
by gathering, processing, and presenting relevant information.
Naive Query
This term refers to the initial query or set of queries made when
foraging in a new information domain. At this stage, the user or system
may not have enough knowledge about the domain to ask precise or
well-informed questions. These queries are essentially educated guesses
or "wild ass guesses" that serve as a starting point for the
information foraging process.
Informed Query
As the user or system gathers more information about the domain, they
can start to ask more focused and informed queries. These queries follow
the "information scent", a term from information foraging theory that
refers to the cues that guide the user or system towards useful
information. Informed queries are more likely to yield relevant and
useful results compared to naive queries.
Precision vs Recall
These are two key concepts from information retrieval that measure the
effectiveness of a search process. Precision refers to the proportion of
retrieved information that is relevant, while recall refers to the
proportion of all relevant information that is retrieved. In other
words, precision measures the quality of the search results, while
recall measures the quantity. A good search process should aim for a
balance between precision and recall, retrieving as much relevant
information as possible (high recall) while minimizing the retrieval of
irrelevant information (high precision).
Use Cases
The BSHR loop is designed to be versatile and adaptable, capable of
addressing a wide range of information needs across various domains.
Here are some examples of how it can be implemented:
Business Data Lake

In the context of a business data lake, the BSHR loop can be used to
navigate through vast amounts of unstructured and structured data. It
can help answer complex business queries, identify trends, and provide
insights that can drive decision-making. For instance, it can help a
business analyst understand the impact of a particular marketing
campaign by brainstorming relevant queries, searching through the data
lake, formulating hypotheses, and refining these hypotheses based on the
evidence gathered.
Internet Search
The BSHR loop can be used to enhance the effectiveness of internet
search. It can help users navigate through the vast amount of
information available online and find the most relevant and reliable
sources. For example, a student researching a complex topic can use the
BSHR loop to generate a list of search queries, find relevant sources,
formulate an initial understanding of the topic, and refine this
understanding as more information is gathered.
University Library System
In a university library system, the BSHR loop can be used to help
students and researchers find the information they need. It can generate
a list of search queries based on the user's information needs, search
through the library's resources, formulate a hypothesis, and refine
this hypothesis as more information is gathered. This can be
particularly useful for literature reviews or research projects.
Personal Archive
The BSHR loop can also be used to navigate through personal archives,
such as a collection of digital photos, documents, or emails. It can
help users find specific items in their archive based on their
information needs. For example, a user looking for all photos from a
particular event can use the BSHR loop to generate search queries, find
relevant photos, and refine the search as needed.
Rules of Thumb and Examples
Note: the "{text input here}" is a placeholder for actual
text/context
1. Use the latest model

For best results, we generally recommend using the latest, most capable
models. As of November 2022, the best options are the
"text-davinci-003" model for
text generation, and the "code-davinci-002" model for code
generation.
2. Put instructions at the beginning of the prompt and use ### or """ to separate the
instruction and context
Less effective :
Summarize the text below as a bullet point list of the most important
points.
{text input here}
Better :
Summarize the text below as a bullet point list of the most important
points.
Text: """
{text input here}
"""
3. Be specific, descriptive and as detailed as possible about the desired context,
outcome, length, format, style, etc
Be specific about the context, outcome, length, format, style, etc
Less effective :
Write a poem about OpenAI.
Better :
Write a short inspiring poem about OpenAI, focusing on the recent DALL-E
product launch (DALL-E is a text to image ML model) in the style of a
{famous poet}
4. Articulate the desired output format through examples (example 1, example 2).
Less effective :
Extract the entities mentioned in the text below. Extract the following
4 entity types: company names, people names, specific topics and

themes.
Text: {text}
Show, and tell - the models respond better when shown specific format
requirements. This also makes it easier to programmatically parse out
multiple outputs reliably.
Better :
Extract the important entities mentioned in the text below. First
extract all company names, then extract all people names, then extract
specific topics which fit the content and finally extract general
overarching themes
Desired format:
Company names: <comma_separated_list_of_company_names>
People names: -||-
Specific topics: -||-
General themes: -||-
Text: {text}
5. Start with zero-shot, then few-shot (example), neither of them worked, then fine-tune
Zero-shot
Extract keywords from the below text.
Text: {text}
Keywords:
Few-shot - provide a couple of examples
Extract keywords from the corresponding texts below.
Text 1: Stripe provides APIs that web developers can use to integrate
payment processing into their websites and mobile applications.
Keywords 1: Stripe, payment processing, APIs, web developers, websites,
mobile applications
##
Text 2: OpenAI has trained cutting-edge language models that are very

good at understanding and generating text. Our API provides access to
these models and can be used to solve virtually any task that involves
processing language.
Keywords 2: OpenAI, language models, text processing, API.
##
Text 3: {text}
Keywords 3:
Fine-tune: see fine-tune best practices
here.
6. Reduce "fluffy" and imprecise descriptions
Less effective :
The description for this product should be fairly short, a few sentences
only, and not too much more.
Better :
Use a 3 to 5 sentence paragraph to describe this product.
7. Instead of just saying what not to do, say what to do instead
Less effective :
The following is a conversation between an Agent and a Customer. DO NOT
ASK USERNAME OR PASSWORD. DO NOT REPEAT.
Customer: I can't log in to my account.
Agent:
Better :
The following is a conversation between an Agent and a Customer. The
agent will attempt to diagnose the problem and suggest a solution,
whilst refraining from asking any questions related to PII. Instead of
asking for PII, such as username or password, refer the user to the help
article www.samplewebsite.com/help/faq
Customer: I can't log in to my account.
Agent:
8. Code Generation Specific - Use "leading words" to nudge the model toward a
particular pattern

Less effective :
# Write a simple python function that
# 1. Ask me for a number in mile
# 2. It converts miles to kilometers
In this code example below, adding "import" hints to the model that it
should start writing in Python. (Similarly "SELECT" is a good hint for
the start of a SQL statement.)
Better :
# Write a simple python function that
# 1. Ask me for a number in mile
# 2. It converts miles to kilometers
import