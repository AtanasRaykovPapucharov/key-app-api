# Cron Schedule Reference

## Cron Format

```text
┌───────────── minute (0 - 59)
│ ┌─────────── hour (0 - 23)
│ │ ┌───────── day of month (1 - 31)
│ │ │ ┌─────── month (1 - 12)
│ │ │ │ ┌───── day of week (0 - 7)
│ │ │ │ │
* * * * *
```

## Common Examples

| Service         | Cron Expression | Runs                                     |
| --------------- | --------------- | ---------------------------------------- |
| Every minute    | `* * * * *`     | Every minute                             |
| Every 5 minutes | `*/5 * * * *`   | Every 5 minutes                          |
| Hourly          | `0 * * * *`     | Every hour                               |
| Every 3 hours   | `0 */3 * * *`   | Every 3 hours: 00:00, 03:00, 06:00, etc. |
| Daily           | `0 0 * * *`     | Every day at midnight                    |
| Every 3 days    | `0 0 */3 * *`   | Every 3 days                             |
| Weekly          | `0 0 * * 1`     | Every Monday at midnight                 |
| Every Sunday    | `0 0 * * 0`     | Every Sunday at midnight                 |
| Every Monday    | `0 0 * * 1`     | Every Monday at midnight                 |
| Every Tuesday   | `0 0 * * 2`     | Every Tuesday at midnight                |
| Every Wednesday | `0 0 * * 3`     | Every Wednesday at midnight              |
| Every Thursday  | `0 0 * * 4`     | Every Thursday at midnight               |
| Every Friday    | `0 0 * * 5`     | Every Friday at midnight                 |
| Every Saturday  | `0 0 * * 6`     | Every Saturday at midnight               |
| Monthly         | `0 0 1 * *`     | 1st day of every month at midnight       |

> **Note:** Cron jobs run according to the server's timezone unless you explicitly configure a timezone.
