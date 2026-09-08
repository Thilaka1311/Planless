-- Migration: 013_create_indexes
-- Description: Create performance optimization indexes for Planless V2

-- Users Table
-- Note: users(public_id) already has an automatic unique index due to its UNIQUE constraint.

-- Circles Table
CREATE INDEX idx_circles_created_by ON circles(created_by);

-- Circle Members Table
CREATE INDEX idx_circle_members_user_id ON circle_members(user_id);
CREATE INDEX idx_circle_members_circle_id ON circle_members(circle_id);

-- Plans Table
CREATE INDEX idx_plans_host_id ON plans(host_id);
CREATE INDEX idx_plans_scheduled_at ON plans(scheduled_at);
CREATE INDEX idx_plans_status ON plans(status);
CREATE INDEX idx_plans_category ON plans(category);
CREATE INDEX idx_plans_subcategory ON plans(subcategory);

-- Plan Participants Table
CREATE INDEX idx_plan_participants_user_id ON plan_participants(user_id);
CREATE INDEX idx_plan_participants_plan_id ON plan_participants(plan_id);
CREATE INDEX idx_plan_participants_rsvp_status ON plan_participants(rsvp_status);

-- Friendships Table
CREATE INDEX idx_friendships_user_1_id ON friendships(user_1_id);
CREATE INDEX idx_friendships_user_2_id ON friendships(user_2_id);
CREATE INDEX idx_friendships_requested_by ON friendships(requested_by);
CREATE INDEX idx_friendships_status ON friendships(status);

-- Plan Teams Table
CREATE INDEX idx_plan_teams_plan_id ON plan_teams(plan_id);

-- Team Members Table
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
-- Note: team_members(participant_id) already has an automatic unique index due to its UNIQUE constraint.

-- Chat Messages Table
CREATE INDEX idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_plan_created_at ON chat_messages(plan_id, created_at);

-- Completions Table
CREATE INDEX idx_completions_status ON completions(status);
-- Note: completions(plan_id) already has an automatic unique index due to its UNIQUE constraint.

-- Memories Table
-- Note: memories(plan_id) and memories(completion_id) already have automatic unique indexes due to UNIQUE constraints.

-- Wallet Transactions Table
CREATE INDEX idx_wallet_transactions_debtor_id ON wallet_transactions(debtor_id);
CREATE INDEX idx_wallet_transactions_creditor_id ON wallet_transactions(creditor_id);
CREATE INDEX idx_wallet_transactions_plan_id ON wallet_transactions(plan_id);
CREATE INDEX idx_wallet_transactions_status ON wallet_transactions(status);

-- Notifications Table
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_user_created_at ON notifications(user_id, created_at);
