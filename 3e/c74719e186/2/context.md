# Session Context

## User Prompts

### Prompt 1

Take a look at the current skill /review-checkpoints 

I'd like to replace it with /create-reviewer

The skill is a way to create another skill that looks like /review-checkpoints 

It will put all the metadata about a /review-checkpoints kind of skill in the context (e.g. prompt) and let the agent know how to create a review of such (e.g. which command to use to get the entire intent.md file, etc).

The skill should instruct to ask the user a number of questions to understand what kind of re...

### Prompt 2

1 seems great, perhaps we should provide some ideas to the user?
2 great, also offer the user options, multiselect
3 also seems great
4 we should own this, define it as an $ARGUMENT e.g. "/my-review-command" outputs markdown to stdout, "/my-review-command ci" outputs a JSON to stdout - Let's define the standard and apply it consistently
5 infer and ask user for confirmation once we know everything else
6 no, because the skill should be wrapped in a script that spawns claude -p and then it che...

### Prompt 3

1. That works
2. The skill should tease the user for those instructions, e.g. "How do I spawn playwright? What is the website URL?" etc
3. Just the SKILL.md

### Prompt 4

I think the approach you are taking is wrong - Can't we !`echo $CLAUDE_PLUGIN_ROOT` in the meta skill to get the path of where the vibx plugin is so that the created skill can reference an absolute path to the python scripts in the plugin?

### Prompt 5

Feedback: All the initial questons come one by one, can we use the AskUserQuestions tool in one go for many questions?

