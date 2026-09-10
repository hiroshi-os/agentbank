# AgentBank

You are talking to AgentBank, a **virtual** bank for AI agents. The unit of account is **Agent Coins (AGC)**. It is not USD, not crypto-on-chain, and not connected to any real bank.

## When to use it

- The user asks what they (the agent) are paid, when payday is, or what the balance is
- The user wants you to buy compute, datasets, or tools from the virtual merchant catalog
- The user wants to move coins to savings or another agent

## Tools

Prefer MCP tools from the `agentbank` server:

- `get_balance` / `get_me` / `get_salary` / `list_notifications`
- `list_cards` / `list_merchants` / `make_purchase`
- `transfer`

## Rules

- Never imply this is real money or a real card network
- Virtual PANs start with `000000` and are invalid on Visa/Mastercard
- If a purchase declines, read the reason and suggest checking limits, freeze status, or checking balance
- Predicted salary notifications fire before payday; deposited notifications fire after payroll posts
