#!/usr/bin/env bash
# logex Stop hook — non-blocking reminder.
# Prints a gentle suggestion at session end. Never fails the turn.
{
  echo "💡 Consider writing a logex article from this session: run /logex"
} 2>/dev/null || true
exit 0
