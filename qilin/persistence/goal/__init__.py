"""Goal domain durable storage (DSH dsh-goal alignment).

Event-sourced like the reference: every accepted verb appends one
``goal_changes`` row whose JSON payload is the complete post-change state
(or a clear tombstone). The current projection is the last row folded
last-wins; compare-and-set guards validate the expected ref against that
head inside the append transaction.
"""
