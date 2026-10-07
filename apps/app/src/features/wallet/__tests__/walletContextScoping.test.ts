import { describe, it, expect, vi, beforeEach } from "vitest";
import { calculateWalletSummary, getParticipantFinancialState } from "../services/walletService";

describe("Wallet Context Scoping & Financial Correctness", () => {
  const CURRENT_USER_ID = "11111111-1111-4111-8111-111111111111";
  const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
  const THIRD_USER_ID = "33333333-3333-4333-8333-333333333333";
  const PLAN_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

  const mockUsers = [
    { id: CURRENT_USER_ID, full_name: "Current User", public_id: "U001" },
    { id: OTHER_USER_ID, full_name: "Other Friend", public_id: "U002" },
    { id: THIRD_USER_ID, full_name: "Third Friend", public_id: "U003" },
  ];

  const mockPlans = [
    { id: PLAN_1, title: "Goa Weekend Trip", total_cost: 3000 },
  ];

  it("handles empty state cleanly with zero balances and no crashes", () => {
    const summary = calculateWalletSummary(
      CURRENT_USER_ID,
      [],
      [mockUsers[0]],
      [],
      [],
      [],
      []
    );

    expect(summary.overallBalance).toBe(0);
    expect(summary.totalYouOwe).toBe(0);
    expect(summary.totalYouAreOwed).toBe(0);
    expect(summary.personRelationships).toHaveLength(0);
    expect(summary.planRelationships).toHaveLength(0);
  });

  it("calculates correct creditor relationship when current user paid and others owe their share", () => {
    const dbExpenses = [
      {
        id: "exp-1",
        plan_id: PLAN_1,
        payer_id: CURRENT_USER_ID,
        title: "Dinner",
        total_amount: 3000,
        participants: [
          { user_id: CURRENT_USER_ID, amount_owed: 1000, amount_paid: 1000, status: "PAID" },
          { user_id: OTHER_USER_ID, amount_owed: 1000, amount_paid: 0, status: "PENDING" },
          { user_id: THIRD_USER_ID, amount_owed: 1000, amount_paid: 0, status: "PENDING" },
        ],
      },
    ];

    const dbParticipants = [
      { plan_id: PLAN_1, user_id: CURRENT_USER_ID, rsvp_status: "JOINED" },
      { plan_id: PLAN_1, user_id: OTHER_USER_ID, rsvp_status: "JOINED" },
      { plan_id: PLAN_1, user_id: THIRD_USER_ID, rsvp_status: "JOINED" },
    ];

    const summary = calculateWalletSummary(
      CURRENT_USER_ID,
      dbExpenses,
      mockUsers,
      mockPlans,
      dbParticipants,
      [],
      []
    );

    // Current user is owed 1000 from Other Friend and 1000 from Third Friend
    expect(summary.totalYouAreOwed).toBe(2000);
    expect(summary.totalYouOwe).toBe(0);
    expect(summary.overallBalance).toBe(2000);

    const relOther = summary.personRelationships.find((r) => r.userId === OTHER_USER_ID);
    expect(relOther).toBeDefined();
    expect(relOther?.netBalance).toBe(1000);
    expect(relOther?.expenses).toHaveLength(1);

    const relThird = summary.personRelationships.find((r) => r.userId === THIRD_USER_ID);
    expect(relThird).toBeDefined();
    expect(relThird?.netBalance).toBe(1000);
    expect(relThird?.expenses).toHaveLength(1);
  });

  it("calculates correct debtor relationship when another user paid and current user owes", () => {
    const dbExpenses = [
      {
        id: "exp-2",
        plan_id: PLAN_1,
        payer_id: OTHER_USER_ID,
        title: "Resort Stay",
        total_amount: 2000,
        participants: [
          { user_id: CURRENT_USER_ID, amount_owed: 1000, amount_paid: 0, status: "PENDING" },
          { user_id: OTHER_USER_ID, amount_owed: 1000, amount_paid: 1000, status: "PAID" },
        ],
      },
    ];

    const dbParticipants = [
      { plan_id: PLAN_1, user_id: CURRENT_USER_ID, rsvp_status: "JOINED" },
      { plan_id: PLAN_1, user_id: OTHER_USER_ID, rsvp_status: "JOINED" },
    ];

    const summary = calculateWalletSummary(
      CURRENT_USER_ID,
      dbExpenses,
      mockUsers,
      mockPlans,
      dbParticipants,
      [],
      []
    );

    expect(summary.totalYouOwe).toBe(1000);
    expect(summary.totalYouAreOwed).toBe(0);
    expect(summary.overallBalance).toBe(-1000);

    const relOther = summary.personRelationships.find((r) => r.userId === OTHER_USER_ID);
    expect(relOther).toBeDefined();
    expect(relOther?.netBalance).toBe(-1000);
    expect(relOther?.expenses).toHaveLength(1);
  });

  it("handles settlements correctly and attaches to relevant person balances", () => {
    const dbExpenses = [
      {
        id: "exp-3",
        plan_id: PLAN_1,
        payer_id: OTHER_USER_ID,
        title: "Snacks",
        total_amount: 500,
        participants: [
          { user_id: CURRENT_USER_ID, amount_owed: 500, amount_paid: 500, status: "SETTLED" },
        ],
      },
    ];

    const dbSettlements = [
      {
        id: "st-1",
        payer_id: CURRENT_USER_ID,
        receiver_id: OTHER_USER_ID,
        amount: 500,
        plan_id: PLAN_1,
        created_at: new Date().toISOString(),
      },
    ];

    const dbParticipants = [
      { plan_id: PLAN_1, user_id: CURRENT_USER_ID, rsvp_status: "JOINED" },
      { plan_id: PLAN_1, user_id: OTHER_USER_ID, rsvp_status: "JOINED" },
    ];

    const summary = calculateWalletSummary(
      CURRENT_USER_ID,
      dbExpenses,
      mockUsers,
      mockPlans,
      dbParticipants,
      [],
      dbSettlements
    );

    expect(summary.totalYouOwe).toBe(0);
    expect(summary.totalYouAreOwed).toBe(0);
    expect(summary.overallBalance).toBe(0);

    // Settlements appear under settled relationships
    const settledRel = summary.settledRelationships.find((r) => r.userId === OTHER_USER_ID);
    expect(settledRel).toBeDefined();
    expect(settledRel?.settlements).toHaveLength(1);
    expect(settledRel?.settlements[0].id).toBe("st-1");
  });

  it("evaluates participant financial state accurately for payment kept vs excluded", () => {
    expect(getParticipantFinancialState("JOINED", null)).toBe("ACTIVE");
    expect(getParticipantFinancialState("HOST", null)).toBe("ACTIVE");
    expect(getParticipantFinancialState("SKIPPED", "PAYMENT_KEPT")).toBe("PAYMENT_KEPT");
    expect(getParticipantFinancialState("SKIPPED", "CANNOT_ATTEND")).toBe("EXCLUDED");
    expect(getParticipantFinancialState("DECLINED", null)).toBe("EXCLUDED");
    expect(getParticipantFinancialState("LEFT", null)).toBe("EXCLUDED");
  });
});
