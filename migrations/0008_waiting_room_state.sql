ALTER TABLE event_live_state ADD COLUMN waiting_message TEXT;
ALTER TABLE event_live_state ADD COLUMN waiting_show_leaderboard INTEGER NOT NULL DEFAULT 0;
ALTER TABLE event_live_state ADD COLUMN waiting_show_next_round INTEGER NOT NULL DEFAULT 1;
