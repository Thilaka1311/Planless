import { Router } from "express";
import { getSupabaseClient } from "../server";
import { authMiddleware, AuthenticatedRequest } from "../middleware/auth";
import { env } from "../config/env";

const router = Router();

router.get("/fetch-all", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const client = getSupabaseClient(req.token);
    if (!client) {
      res.json({
        configured: false,
        tables_missing: true,
        missing_tables: ["users", "plans", "plan_participants", "transactions", "memories", "plan_outcomes", "friendships"],
        data: null
      });
      return;
    }

    // Support targeted table fetching
    const requestedTables = req.query.tables ? String(req.query.tables).split(",") : null;

    const tables = [
      "users",
      "plans",
      "plan_participants",
      "wallet_expenses",
      "memories",
      "memory_results",
      "plan_outcomes",
      "user_stats",
      "notifications",
      "plan_reminders",
      "friendships",
      "plan_team_assignments",
      "discovery_sections",
      "discovery_items"
    ];

    const results: Record<string, any[]> = {};
    const missingTables: string[] = [];

    await Promise.all(
      tables.map(async (table) => {
        if (requestedTables && !requestedTables.includes(table)) {
          return;
        }
        try {
          const { data, error } = await client.from(table).select("*");
          if (error) {
            console.error("[SYNC_TABLE_FAILED]", table, error);
            missingTables.push(table);
          } else {
            console.log("[SYNC_TABLE_SUCCESS]", table, data?.length || 0);
            results[table] = data || [];
            if (table === "plans") {
              const plansList = data || [];
              const uuids = plansList.map(p => p.id);
              const uniqueUuids = [...new Set(uuids)];
              const duplicates = uuids.filter((item, index) => uuids.indexOf(item) !== index);
              console.log(`[Supabase DB Audit] Raw plans count from database: ${plansList.length}`);
              console.log(`[Supabase DB Audit] Number of unique plan UUIDs: ${uniqueUuids.length}`);
              if (duplicates.length > 0) {
                console.error(`[Supabase DB Audit] Duplicate plan UUIDs detected:`, duplicates);
              }
            }
            if (table === "plan_participants") {
              console.log(`[Supabase DB Audit] Raw plan_participants count: ${data?.length || 0}`);
            }
          }
        } catch (tableErr: any) {
          console.error("[SYNC_TABLE_FAILED]", table, tableErr);
          missingTables.push(table);
        }
      })
    );

    res.json({
      configured: true,
      tables_missing: missingTables.length > 0,
      missing_tables: missingTables,
      data: results
    });
  } catch (err: any) {
    console.error("[Supabase Fetch Error]:", err);
    res.status(500).json({ error: err.message || "Failed to sync tables from Supabase." });
  }
});

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val: any) => typeof val === "string" && uuidRegex.test(val);

// GET /api/db/team-assignments?plan_id=<uuid>
// Returns all team assignments for the given plan.
router.get("/team-assignments", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const planId = req.query.plan_id as string | undefined;
    if (!planId) {
      res.status(400).json({ error: "Missing plan_id query parameter." });
      return;
    }
    const client = getSupabaseClient(req.token);
    if (!client) {
      res.status(503).json({ error: "Supabase client not initialized." });
      return;
    }
    const { data, error } = await client
      .from("plan_team_assignments")
      .select("*")
      .eq("plan_id", planId);
    if (error) {
      console.error("[DB] team-assignments fetch error:", error);
      res.status(500).json({ error: error.message });
      return;
    }
    res.json({ success: true, count: data?.length || 0, data: data || [] });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Internal error" });
  }
});

router.post("/upsert", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { table, records } = req.body;
    if (!table || !records || !Array.isArray(records)) {
      res.status(400).json({ error: "Invalid payload parameters. Expected 'table' name and 'records' array." });
      return;
    }

    // Align frontend plans data schema with V2 database schema columns
    if (table === "plans") {

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        
        // If it is an update (rec.id exists), only map fields that are present in the update payload.
        // This prevents overwriting existing fields (like title, description, place details) with empty strings/defaults,
        // which avoids violating table constraints (like CHECK check_title).
        if (rec.id) {
          const mappedRec: any = { id: rec.id };
          if (rec.public_id !== undefined) mappedRec.public_id = rec.public_id;
          if (rec.host_id !== undefined) mappedRec.host_id = rec.host_id;
          if (rec.created_by !== undefined) mappedRec.host_id = rec.created_by;
          if (rec.title !== undefined) mappedRec.title = rec.title;
          if (rec.description !== undefined) mappedRec.description = rec.description;
          if (rec.notes !== undefined) mappedRec.description = rec.notes;
          if (rec.coverImage !== undefined) mappedRec.cover_image = rec.coverImage;
          if (rec.cover_image !== undefined) mappedRec.cover_image = rec.cover_image;
          
          if (rec.category !== undefined) {
            const rawCat = rec.category.toLowerCase();
            let mappedCat = "OTHER";
            if (rawCat === "sports") mappedCat = "SPORTS";
            else if (rawCat === "movies") mappedCat = "MOVIES";
            else if (rawCat === "dining" || rawCat === "restaurants" || rawCat === "brunch") mappedCat = "DINING";
            else if (rawCat === "entertainment") mappedCat = "ENTERTAINMENT";
            else if (rawCat === "travel") mappedCat = "TRAVEL";
            else if (rawCat === "fitness") mappedCat = "FITNESS";
            else if (rawCat === "study") mappedCat = "STUDY";
            mappedRec.category = mappedCat;
          }

          if (rec.subcategory !== undefined) {
            const rawSub = rec.subcategory.toLowerCase();
            let mappedSub = "OTHER";
            if (rawSub === "football") mappedSub = "FOOTBALL";
            else if (rawSub === "badminton") mappedSub = "BADMINTON";
            else if (rawSub === "cricket") mappedSub = "CRICKET";
            else if (rawSub === "basketball") mappedSub = "BASKETBALL";
            else if (rawSub === "volleyball") mappedSub = "VOLLEYBALL";
            else if (rawSub === "tennis") mappedSub = "TENNIS";
            else if (rawSub === "pickleball") mappedSub = "PICKLEBALL";
            else if (rawSub === "bowling") mappedSub = "BOWLING";
            else if (rawSub === "go_karting") mappedSub = "GO_KARTING";
            else if (rawSub === "movie") mappedSub = "MOVIE";
            else if (rawSub === "restaurant") mappedSub = "RESTAURANT";
            else if (rawSub === "cafe") mappedSub = "CAFE";
            else if (rawSub === "road_trip") mappedSub = "ROAD_TRIP";
            else if (rawSub === "gym") mappedSub = "GYM";
            else if (rawSub === "study_session") mappedSub = "STUDY_SESSION";
            mappedRec.subcategory = mappedSub;
          }

          if (rec.place_id !== undefined) mappedRec.place_id = rec.place_id;
          if (rec.place_name !== undefined) mappedRec.place_name = rec.place_name;
          if (rec.location !== undefined) mappedRec.place_name = rec.location;
          if (rec.place_address !== undefined) mappedRec.place_address = rec.place_address;
          if (rec.scheduled_at !== undefined) mappedRec.scheduled_at = rec.scheduled_at;
          if (rec.datetime !== undefined) mappedRec.scheduled_at = rec.datetime;
          if (rec.rsvp_deadline !== undefined) mappedRec.rsvp_deadline = rec.rsvp_deadline;
          if (rec.response_deadline_at !== undefined) mappedRec.rsvp_deadline = rec.response_deadline_at;
          if (rec.max_participants !== undefined) mappedRec.max_participants = rec.max_participants;
          if (rec.total_cost !== undefined) mappedRec.total_cost = rec.total_cost;
          else if (rec.entry_fee !== undefined) mappedRec.total_cost = rec.entry_fee;
          if (rec.status !== undefined) {
            const rawStatus = rec.status.toLowerCase();
            let mappedStatus = "LIVE";
            if (rawStatus === "draft") mappedStatus = "DRAFT";
            else if (rawStatus === "open" || rawStatus === "active" || rawStatus === "live") mappedStatus = "LIVE";
            else if (rawStatus === "locked") mappedStatus = "LOCKED";
            else if (rawStatus === "overdue") mappedStatus = "OVERDUE";
            else if (rawStatus === "completed") mappedStatus = "COMPLETED";
            else if (rawStatus === "cancelled") mappedStatus = "CANCELLED";
            mappedRec.status = mappedStatus;
          }
          if (rec.created_at !== undefined) mappedRec.created_at = rec.created_at;
          if (rec.updated_at !== undefined) mappedRec.updated_at = rec.updated_at;
          records[i] = mappedRec;
        } else {
          // New Insert record: map all fields with proper defaults
          const mappedRec: any = {};
          if (rec.public_id) mappedRec.public_id = rec.public_id;
          mappedRec.host_id = rec.host_id || rec.created_by || req.user!.id;
          mappedRec.title = rec.title || "";
          mappedRec.description = rec.description || rec.notes || "";
          
          const rawCat = (rec.category || "other").toLowerCase();
          let mappedCat = "OTHER";
          if (rawCat === "sports") mappedCat = "SPORTS";
          else if (rawCat === "movies") mappedCat = "MOVIES";
          else if (rawCat === "dining" || rawCat === "restaurants" || rawCat === "brunch") mappedCat = "DINING";
          else if (rawCat === "entertainment") mappedCat = "ENTERTAINMENT";
          else if (rawCat === "travel") mappedCat = "TRAVEL";
          else if (rawCat === "fitness") mappedCat = "FITNESS";
          else if (rawCat === "study") mappedCat = "STUDY";
          mappedRec.category = mappedCat;

          const rawSub = (rec.subcategory || rec.activity_type || "").toLowerCase();
          let mappedSub = "OTHER";
          if (rawSub === "football") mappedSub = "FOOTBALL";
          else if (rawSub === "badminton") mappedSub = "BADMINTON";
          else if (rawSub === "cricket") mappedSub = "CRICKET";
          else if (rawSub === "basketball") mappedSub = "BASKETBALL";
          else if (rawSub === "volleyball") mappedSub = "VOLLEYBALL";
          else if (rawSub === "tennis") mappedSub = "TENNIS";
          else if (rawSub === "pickleball") mappedSub = "PICKLEBALL";
          else if (rawSub === "bowling") mappedSub = "BOWLING";
          else if (rawSub === "go_karting") mappedSub = "GO_KARTING";
          else if (rawSub === "movie") mappedSub = "MOVIE";
          else if (rawSub === "restaurant") mappedSub = "RESTAURANT";
          else if (rawSub === "cafe") mappedSub = "CAFE";
          else if (rawSub === "road_trip") mappedSub = "ROAD_TRIP";
          else if (rawSub === "gym") mappedSub = "GYM";
          else if (rawSub === "study_session") mappedSub = "STUDY_SESSION";
          else {
            if (mappedCat === "MOVIES") mappedSub = "MOVIE";
            else if (mappedCat === "DINING") mappedSub = "RESTAURANT";
          }
          mappedRec.subcategory = mappedSub;

          mappedRec.place_id = rec.place_id || "TBD";
          mappedRec.place_name = rec.place_name || rec.location || "TBD";
          mappedRec.place_address = rec.place_address || rec.location || "TBD";
          mappedRec.scheduled_at = rec.scheduled_at || rec.datetime || new Date().toISOString();
          mappedRec.rsvp_deadline = rec.rsvp_deadline || rec.response_deadline_at || mappedRec.scheduled_at;
          mappedRec.max_participants = rec.max_participants !== undefined ? rec.max_participants : (rec.join_limit !== undefined ? rec.join_limit : (rec.max_people !== undefined ? rec.max_people : null));
          mappedRec.total_cost = rec.total_cost !== undefined ? rec.total_cost : (rec.entry_fee !== undefined ? rec.entry_fee : (rec.costAmount !== undefined ? rec.costAmount : 0.00));
          mappedRec.cover_image = rec.coverImage || rec.cover_image || null;

          const rawStatus = (rec.status || "live").toLowerCase();
          let mappedStatus = "LIVE";
          if (rawStatus === "draft") mappedStatus = "DRAFT";
          else if (rawStatus === "open" || rawStatus === "active" || rawStatus === "live") mappedStatus = "LIVE";
          else if (rawStatus === "locked") mappedStatus = "LOCKED";
          else if (rawStatus === "overdue") mappedStatus = "OVERDUE";
          else if (rawStatus === "completed") mappedStatus = "COMPLETED";
          else if (rawStatus === "cancelled") mappedStatus = "CANCELLED";
          mappedRec.status = mappedStatus;

          if (rec.created_at) mappedRec.created_at = rec.created_at;
          if (rec.updated_at) mappedRec.updated_at = rec.updated_at;

          records[i] = mappedRec;
        }
      }
    }


    // Runtime UUID validation guards
    for (const rec of records) {
      if (table === "plan_participants") {
        if (rec.plan_id && !isUuid(rec.plan_id)) {
          console.warn(`[DB Integrity Warning] plan_participants mutation has non-UUID plan_id: "${rec.plan_id}"`);
        }
        if (rec.user_id && !isUuid(rec.user_id)) {
          console.warn(`[DB Integrity Warning] plan_participants mutation has non-UUID user_id: "${rec.user_id}"`);
        }
      } else if (table === "plans") {
        if (rec.created_by && !isUuid(rec.created_by)) {
          console.warn(`[DB Integrity Warning] plans mutation has non-UUID created_by: "${rec.created_by}"`);
        }
      } else if (table === "wallet_expenses") {
        if (rec.payer_id && !isUuid(rec.payer_id)) {
          console.warn(`[DB Integrity Warning] wallet_expenses mutation has non-UUID payer_id: "${rec.payer_id}"`);
        }
        if (rec.plan_id && !isUuid(rec.plan_id)) {
          console.warn(`[DB Integrity Warning] wallet_expenses mutation has non-UUID plan_id: "${rec.plan_id}"`);
        }
      }
    }

    const client = getSupabaseClient(req.token);
    if (!client) {
      res.status(503).json({ error: "Supabase client key or endpoint is not initialized." });
      return;
    }

    // Phase 9A High-Risk Checks
    if (table === "plans") {
      for (const rec of records) {
        if (rec.id) {
          const { data: currentPlan } = await client
            .from("plans")
            .select("host_id, created_by")
            .eq("id", rec.id)
            .single();

          if (currentPlan) {
            const currentHost = currentPlan.host_id || currentPlan.created_by;
            if (currentHost !== req.user!.id) {
              res.status(403).json({ error: "Forbidden. Only the host can modify this plan." });
              return;
            }
          }
        }
      }
    }

    if (table === "plan_participants") {
      for (const rec of records) {
        if (rec.user_id && rec.user_id !== req.user!.id) {
          const planId = rec.plan_id;
          if (planId) {
            const { data: plan } = await client
              .from("plans")
              .select("host_id, created_by")
              .eq("id", planId)
              .single();
            if (plan) {
              const planHost = plan.host_id || plan.created_by;
              if (planHost !== req.user!.id) {
                res.status(403).json({ error: "Forbidden. Only the plan host can manage other participants." });
                return;
              }
            }
          }
        }
      }
    }



    // plan_team_assignments: upsert on (plan_id, user_id) conflict
    // This allows moving a player between Team A and Team B.
    if (table === "plan_team_assignments") {
      const { data, error } = await client
        .from("plan_team_assignments")
        .upsert(records, { onConflict: "plan_id,user_id" })
        .select("*");
      if (error) {
        console.error(`[Supabase DB] Error writing to plan_team_assignments:`, error);
        res.status(500).json({ error: error.message, details: error.details });
        return;
      }
      res.json({ success: true, count: data?.length || 0, data: data || [] });
      return;
    }

    // Guard: Prevent duplicate plan_participants joins/invitations
    if (table === "plan_participants") {
      const sanitizedRecords = [];
      const duplicateMatches = [];

      console.log("[WAITLIST BACKEND WRITE] plan_participants payload:", records);

      for (const rec of records) {
        if (!rec.plan_id || !rec.user_id) {
          sanitizedRecords.push(rec);
          continue;
        }

        // Query database to see if record exists using composite unique constraint fields
        const { data: existingRows } = await client
          .from("plan_participants")
          .select("*")
          .eq("plan_id", rec.plan_id)
          .eq("user_id", rec.user_id);

        if (existingRows && existingRows.length > 0) {
          const existing = existingRows[0];
          const updatePayload: Record<string, any> = {};
          let needsUpdate = false;

          for (const key of Object.keys(rec)) {
            if (rec[key] !== existing[key]) {
              updatePayload[key] = rec[key];
              needsUpdate = true;
            }
          }

          if (needsUpdate) {
            console.log(`[DB plan_participants Update] Updating existing participant: plan_id=${rec.plan_id}, user_id=${rec.user_id}, updates:`, updatePayload);
            const { data: updatedRows, error: updateErr } = await client
              .from("plan_participants")
              .update(updatePayload)
              .eq("plan_id", rec.plan_id)
              .eq("user_id", rec.user_id)
              .select("*");

            if (updateErr) {
              console.error(`[DB plan_participants Update Error]:`, updateErr);
              res.status(500).json({ error: updateErr.message, details: updateErr.details, hint: updateErr.hint });
              return;
            }

            if (updatedRows && updatedRows.length > 0) {
              duplicateMatches.push(updatedRows[0]);
            } else {
              duplicateMatches.push(existing);
            }
          } else {
            duplicateMatches.push(existing);
          }
        } else {
          sanitizedRecords.push(rec);
        }
      }

      let finalData = [];
      if (sanitizedRecords.length > 0) {
        // Since there is no longer a surrogate ID, insert is correct for new records.
        // Supabase/PostgREST uses ON CONFLICT (plan_id, user_id) automatically if we run upsert.
        const query = client.from(table).upsert(sanitizedRecords);
        const { data, error } = await query.select("*");
        if (error) {
          if (error.code === "23505") {
            const { data: allMatching } = await client
              .from("plan_participants")
              .select("*")
              .in("plan_id", records.map(r => r.plan_id).filter(Boolean))
              .in("user_id", records.map(r => r.user_id).filter(Boolean));
            res.json({ success: true, count: allMatching?.length || 0, data: allMatching || [] });
            return;
          }
          console.error(`[Supabase DB Operation Sync] Error writing to ${table}:`, error);
          res.status(500).json({ error: error.message, details: error.details, hint: error.hint });
          return;
        }
        finalData = data || [];
      }

      const combinedData = [...finalData, ...duplicateMatches];

      // Trigger backend cost recalculation for the plan(s) affected by these participant changes
      const planIdsToRecalculate = new Set<string>();
      records.forEach(r => { if (r.plan_id) planIdsToRecalculate.add(r.plan_id); });
      for (const pId of planIdsToRecalculate) {
        await recalculatePlanParticipantsCosts(client, pId).catch(err => {
          console.error(`[Backend Cost Recalculation Error] Failed for plan ${pId}:`, err);
        });
      }

      res.json({ success: true, count: combinedData.length, data: combinedData });
      return;
    }


    console.log(`[Supabase DB Write] Table: ${table}, Payload before write:`, records);

    // Per-table write strategy.
    // memories / memory_attendees / memory_ratings use upsert with onConflict so that
    // retrying completePlan (or a double-click) never causes a 23505 unique violation.
    // These tables receive client-generated UUIDs in the `id` field, which would
    // otherwise route them into the UPDATE path — silently writing 0 rows since
    // the row doesn't exist yet.
    let data, error;

    if (table === "memories") {
      const results: any[] = [];
      for (const rec of records) {
        if (rec.plan_id) {
          // Check if memory already exists for this plan_id
          const { data: existing } = await client
            .from("memories")
            .select("*")
            .eq("plan_id", rec.plan_id);
          
          if (existing && existing.length > 0) {
            // Check locking: locked_at set or past editable_until
            const isLocked = existing[0].locked_at || (existing[0].editable_until && new Date(existing[0].editable_until).getTime() < Date.now());
            if (isLocked) {
              res.status(403).json({ error: "Forbidden. Memory is locked and cannot be modified." });
              return;
            }

            // Keep the existing database ID to preserve foreign key references
            const updatePayload = { ...rec, id: existing[0].id };
            const { data: d, error: e } = await client
              .from("memories")
              .update(updatePayload)
              .eq("id", existing[0].id)
              .select("*");
            if (e) { error = e; break; }
            if (d) results.push(...d);
          } else {
            // Insert new memory row
            const { data: d, error: e } = await client
              .from("memories")
              .insert([rec])
              .select("*");
            if (e) { error = e; break; }
            if (d) results.push(...d);
          }
        } else if (rec.id) {
          // Update by id (e.g. host saving football/badminton score)
          const { data: existing } = await client
            .from("memories")
            .select("*")
            .eq("id", rec.id);
          if (existing && existing.length > 0) {
            const isLocked = existing[0].locked_at || (existing[0].editable_until && new Date(existing[0].editable_until).getTime() < Date.now());
            if (isLocked) {
              res.status(403).json({ error: "Forbidden. Memory is locked and cannot be modified." });
              return;
            }
          }

          const { data: d, error: e } = await client
            .from("memories")
            .update(rec)
            .eq("id", rec.id)
            .select("*");
          if (e) { error = e; break; }
          if (d) results.push(...d);
        }
      }
      data = results;
    } else if (table === "memory_results") {
      const results: any[] = [];
      for (const rec of records) {
        if (!rec.memory_id) {
          res.status(400).json({ error: "Missing memory_id in memory_results record." });
          return;
        }

        const { data: memory, error: memErr } = await client
          .from("memories")
          .select("memory_type, editable_until, locked_at")
          .eq("id", rec.memory_id)
          .single();

        if (memErr || !memory) {
          res.status(400).json({ error: "Associated memory record not found." });
          return;
        }

        // Locking rule
        const isLocked = memory.locked_at || (memory.editable_until && new Date(memory.editable_until).getTime() < Date.now());
        if (isLocked) {
          res.status(403).json({ error: "Forbidden. Memory is locked and cannot be modified." });
          return;
        }

        // Schema validation rules
        const type = memory.memory_type;
        if (type === "football") {
          // Require score_home, score_away, mvp_user_id
          if (rec.score_home === undefined || rec.score_home === null ||
              rec.score_away === undefined || rec.score_away === null ||
              !rec.mvp_user_id) {
            res.status(400).json({ error: `Validation failed: ${type} memories require score_home, score_away, and mvp_user_id.` });
            return;
          }
          // Rating and review must be null
          if ((rec.average_rating !== undefined && rec.average_rating !== null) ||
              (rec.review !== undefined && rec.review !== null)) {
            res.status(400).json({ error: `Validation failed: ${type} memories must not contain average_rating or review.` });
            return;
          }
        } else if (type === "badminton") {
          // Require only mvp_user_id
          if (!rec.mvp_user_id) {
            res.status(400).json({ error: `Validation failed: ${type} memories require mvp_user_id.` });
            return;
          }
          // Scores, rating, and review must be null
          if ((rec.score_home !== undefined && rec.score_home !== null) ||
              (rec.score_away !== undefined && rec.score_away !== null) ||
              (rec.average_rating !== undefined && rec.average_rating !== null) ||
              (rec.review !== undefined && rec.review !== null)) {
            res.status(400).json({ error: `Validation failed: ${type} memories must not contain scores, average_rating, or review.` });
            return;
          }
        } else if (type === "movies" || type === "dining") {
          // Require average_rating, optional review
          if (rec.average_rating === undefined || rec.average_rating === null) {
            res.status(400).json({ error: `Validation failed: ${type} memories require average_rating.` });
            return;
          }
          // Scores and MVP must be null
          if ((rec.score_home !== undefined && rec.score_home !== null) ||
              (rec.score_away !== undefined && rec.score_away !== null) ||
              (rec.mvp_user_id !== undefined && rec.mvp_user_id !== null)) {
            res.status(400).json({ error: `Validation failed: ${type} memories must not contain scores or MVP user.` });
            return;
          }
        }

        // Upsert by memory_id
        const { data: existingResult } = await client
          .from("memory_results")
          .select("id")
          .eq("memory_id", rec.memory_id);

        if (existingResult && existingResult.length > 0) {
          const updatePayload = { ...rec, id: existingResult[0].id };
          const { data: d, error: e } = await client
            .from("memory_results")
            .update(updatePayload)
            .eq("id", existingResult[0].id)
            .select("*");
          if (e) { error = e; break; }
          if (d) results.push(...d);
        } else {
          const { data: d, error: e } = await client
            .from("memory_results")
            .insert([rec])
            .select("*");
          if (e) { error = e; break; }
          if (d) results.push(...d);
        }
      }
      data = results;
    } else if (table === "plan_outcomes") {
      // Validate outcomes: for badminton, outcome_type must only be 'mvp_vote', no 'stats' or 'review'!
      // Also, the payload for badminton mvp_vote must only contain { mvp_user_id: ... }
      for (const rec of records) {
        if (!rec.plan_id) {
          res.status(400).json({ error: "Missing plan_id in plan_outcomes record." });
          return;
        }
        const { data: plan, error: planErr } = await client
          .from("plans")
          .select("subcategory, title")
          .eq("id", rec.plan_id)
          .single();
        if (!planErr && plan) {
          const isBadminton = plan.subcategory === "BADMINTON" || (plan.title && plan.title.toLowerCase().includes("badminton"));
          if (isBadminton) {
            if (rec.outcome_type !== "mvp_vote") {
              res.status(400).json({ error: "Validation failed: Badminton outcomes must only be mvp_vote." });
              return;
            }
            if (!rec.payload || !rec.payload.mvp_user_id) {
              res.status(400).json({ error: "Validation failed: Badminton mvp_vote outcome must contain mvp_user_id." });
              return;
            }
            // Enforce Badminton outcomes should only store: { outcome_type: "mvp_vote", mvp_user_id: "<participant_uuid>" }
            rec.payload = { mvp_user_id: rec.payload.mvp_user_id };
          }
        }
      }

      const { data: d, error: e } = await client
        .from("plan_outcomes")
        .upsert(records, { onConflict: "plan_id,submitted_by_user_id,outcome_type" })
        .select("*");
      data = d;
      error = e;
    } else if (table === "users") {
      const { data: d, error: e } = await client
        .from("users")
        .upsert(records, { onConflict: "id" })
        .select("*");
      data = d;
      error = e;
    } else {
      const isInsert = records.every((r: any) => r.id === undefined || r.id === null) &&
        table !== "user_stats";

      if (isInsert) {
        if (table === "plans") {
          console.log("[Supabase DB Write] FINAL PLANS INSERT PAYLOAD:", JSON.stringify(records, null, 2));
        }
        let query = client.from(table).insert(records);
        if (table !== "notifications") {
          query = query.select("*");
        }
        const { data: resData, error: resErr } = await query;
        data = resData;
        error = resErr;
      } else {
        const updatedRows: any[] = [];
        for (const rec of records) {
          if (rec.id) {
            if (table === "plans") {
              console.log("[Supabase DB Write] FINAL PLANS UPDATE BY ID PAYLOAD:", JSON.stringify(rec, null, 2));
            }
            let query = client
              .from(table)
              .update(rec)
              .eq("id", rec.id);
            if (table !== "notifications") {
              query = query.select("*");
            }
            const { data: resData, error: resErr } = await query;
            if (resErr) { error = resErr; break; }
            if (resData) updatedRows.push(...resData);
          } else {
            if (table === "plans") {
              console.log("[Supabase DB Write] FINAL PLANS UPSERT PAYLOAD:", JSON.stringify(rec, null, 2));
            }
            let query = client
              .from(table)
              .upsert([rec]);
            if (table !== "notifications") {
              query = query.select("*");
            }
            const { data: resData, error: resErr } = await query;
            if (resErr) { error = resErr; break; }
            if (resData) updatedRows.push(...resData);
          }
        }
        data = updatedRows;
      }
    }

    // Trigger backend recalculation hook for plan_participants or plans
    if (table === "plan_participants" || table === "plans") {
      const planIdsToRecalculate = new Set<string>();
      if (table === "plans") {
        records.forEach(r => { if (r.id) planIdsToRecalculate.add(r.id); });
      } else {
        records.forEach(r => { if (r.plan_id) planIdsToRecalculate.add(r.plan_id); });
      }
      for (const pId of planIdsToRecalculate) {
        await recalculatePlanParticipantsCosts(client, pId).catch(err => {
          console.error(`[Backend Cost Recalculation Error] Failed for plan ${pId}:`, err);
        });
      }
    }

    console.log(`[Supabase DB Write Success] Table: ${table}, Saved:`, data);
    res.json({ success: true, count: records.length, data });
  } catch (error: any) {
    console.error("[Supabase Sync Proxy Error]:", error);
    res.status(500).json({ error: error.message || "Internal server error syncing row database changes." });
  }
});

/**
 * Backend business cost calculation helper.
 * Calculates cost_per_participant = plans.total_cost / count(joined)
 * Assigns this cost to all 'joined' status participants on the plan, and sets others to NULL.
 */
async function recalculatePlanParticipantsCosts(client: any, planUuid: string): Promise<void> {
  console.log(`[Backend Recalculating Costs] Starting for plan: ${planUuid}`);
  const { data: plan, error: planErr } = await client
    .from("plans")
    .select("total_cost, host_id, max_participants")
    .eq("id", planUuid)
    .single();

  if (planErr || !plan) {
    console.error(`[Backend Recalculating Costs] Plan not found: ${planUuid}`, planErr);
    return;
  }

  const totalCost = Number(plan.total_cost || 0);
  const hostUuid = plan.host_id;

  // Wait 80ms to let current transaction commit so that count is perfectly fresh
  await new Promise(r => setTimeout(r, 80));

  // Fetch all current participants on this plan
  const { data: participants, error: ppErr } = await client
    .from("plan_participants")
    .select("user_id, rsvp_status")
    .eq("plan_id", planUuid);

  if (ppErr || !participants) {
    console.error(`[Backend Recalculating Costs] Failed to query participants for plan: ${planUuid}`, ppErr);
    return;
  }

  // cost_per_participant = total_cost / max_participants (fixed plan capacity).
  // The per-participant cost is based on the plan's defined maximum capacity,
  // not the current number of people who have joined. This keeps the share
  // amount consistent regardless of current RSVP state.
  const divisor = plan.max_participants > 0 ? plan.max_participants : 1;
  const shareAmount = totalCost <= 0 ? 0 : Math.round((totalCost / divisor) * 100) / 100;

  console.log(`[Backend Recalculating Costs] Plan total cost: ₹${totalCost}, max_participants: ${plan.max_participants}, Share per participant: ₹${shareAmount}`);

  // Batch update: Update cost_per_participant to shareAmount for joined, others to NULL
  // Run this as a single transaction update query on the table to avoid row-by-row race conditions
  const { error: batchErr } = await client
    .from("plan_participants")
    .update({ cost_per_participant: null })
    .eq("plan_id", planUuid);

  if (batchErr) {
    console.error(`[Backend Recalculating Costs] Failed to clear participant costs for plan ${planUuid}`, batchErr);
  }

  const { error: batchUpdateErr } = await client
    .from("plan_participants")
    .update({ cost_per_participant: shareAmount })
    .eq("plan_id", planUuid)
    .in("rsvp_status", ["JOINED"]);

  if (batchUpdateErr) {
    console.error(`[Backend Recalculating Costs] Failed to batch update cost_per_participant for plan ${planUuid}`, batchUpdateErr);
  }

  // Wallet Expenses Sync Strategy: Sync using new normalized schema
  if (totalCost <= 0) {
    // No cost: remove all plan-level wallet expenses (message_id IS NULL = plan default)
    await client.from("wallet_expenses").delete().eq("plan_id", planUuid).is("message_id", null);
    return;
  }

  const planTitle = "Plan Fee";

  // Find or create the single plan-level wallet_expense (message_id IS NULL = plan default)
  const { data: existingExpense } = await client
    .from("wallet_expenses")
    .select("id")
    .eq("plan_id", planUuid)
    .is("message_id", null)
    .maybeSingle();

  let expenseId: string;

  if (existingExpense?.id) {
    expenseId = existingExpense.id;
    // Update total_amount if plan cost changed
    await client
      .from("wallet_expenses")
      .update({ total_amount: totalCost, updated_at: new Date().toISOString() })
      .eq("id", expenseId);
  } else {
    // Create the plan expense record (host is the payer)
    const { data: newExpense, error: insertExpErr } = await client
      .from("wallet_expenses")
      .insert({
        plan_id: planUuid,
        payer_id: hostUuid,
        title: planTitle,
        total_amount: totalCost,
        status: "PENDING",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertExpErr || !newExpense) {
      console.error(`[Backend Recalculating Costs] Failed to create wallet_expense for plan ${planUuid}`, insertExpErr);
      return;
    }
    expenseId = newExpense.id;
  }

  // Fetch fresh JOINED participants for this plan
  const { data: freshParticipants } = await client
    .from("plan_participants")
    .select("user_id, rsvp_status")
    .eq("plan_id", planUuid);

  if (!freshParticipants) return;

  const joinedParticipants = freshParticipants.filter((p: any) => {
    const status = String(p.rsvp_status || "").toUpperCase();
    return status === "JOINED";
  });

  const joinedUserIds = joinedParticipants.map((p: any) => p.user_id);

  // Remove participant rows for users no longer JOINED
  if (joinedUserIds.length > 0) {
    await client
      .from("wallet_expense_participants")
      .delete()
      .eq("expense_id", expenseId)
      .not("user_id", "in", `(${joinedUserIds.map((id: string) => `'${id}'`).join(",")})`);
  } else {
    await client.from("wallet_expense_participants").delete().eq("expense_id", expenseId);
  }

  // Upsert participant shares for all JOINED participants
  if (joinedParticipants.length > 0) {
    const participantRows = joinedParticipants.map((p: any) => ({
      expense_id: expenseId,
      user_id: p.user_id,
      amount_owed: shareAmount,
      amount_paid: 0,
      status: "PENDING",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: participantErr } = await client
      .from("wallet_expense_participants")
      .upsert(participantRows, { onConflict: "expense_id,user_id", ignoreDuplicates: false });

    if (participantErr) {
      console.error(`[Backend Recalculating Costs] Failed to upsert wallet_expense_participants for plan ${planUuid}`, participantErr);
    }
  }

  console.log(`[Backend Recalculating Costs] Finished for plan: ${planUuid}`);
}

router.post("/delete", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { table, match } = req.body;
    console.log("[TRACE /api/db/delete] Incoming body:", JSON.stringify(req.body, null, 2));

    if (!table || !match || typeof match !== "object") {
      res.status(400).json({ error: "Invalid payload parameters. Expected 'table' name and 'match' object." });
      return;
    }

    const client = getSupabaseClient(req.token);
    if (!client) {
      res.status(503).json({ error: "Supabase client key or endpoint is not initialized." });
      return;
    }

    // Phase 9A Delete Security Checks
    if (table === "plan_participants") {
      const planId = match.plan_id;
      if (!planId) {
        res.status(400).json({ error: "Missing plan_id in deletion match criteria." });
        return;
      }
      
      const { data: plan } = await client
        .from("plans")
        .select("host_id, created_by")
        .eq("id", planId)
        .single();

      if (!plan) {
        res.status(404).json({ error: "Plan not found." });
        return;
      }

      const planHost = plan.host_id || plan.created_by;
      if (planHost !== req.user!.id) {
        res.status(403).json({ error: "Forbidden. Only the host can remove participants." });
        return;
      }
    }


    console.log(`[TRACE /api/db/delete] table="${table}"  match=${JSON.stringify(match)}`);

    let query = client.from(table).delete();
    for (const [key, val] of Object.entries(match)) {
      console.log(`[TRACE /api/db/delete]   .eq("${key}", "${val}")`);
      query = query.eq(key, val);
    }

    const { data, error } = await query.select("*");

    console.log(`[TRACE /api/db/delete] Supabase error  :`, JSON.stringify(error, null, 2));
    console.log(`[TRACE /api/db/delete] Supabase data   :`, JSON.stringify(data, null, 2));

    if (error) {
      if (error.code === "PGRST205") {
        console.warn(`[TRACE /api/db/delete] Table "${table}" does not exist in schema cache (PGRST205), skipping deletion cleanly.`);
        res.json({ success: true, count: 0, data: [] });
        return;
      }
      console.error(`[TRACE /api/db/delete] *** SUPABASE ERROR for table="${table}" ***`);
      console.error(`  error.message : ${error.message}`);
      console.error(`  error.details : ${(error as any).details}`);
      console.error(`  error.hint    : ${(error as any).hint}`);
      console.error(`  error.code    : ${(error as any).code}`);
      console.error(`[Supabase DB Operation Sync] Error deleting from ${table}:`, error);
      res.status(500).json({ error: error.message, details: (error as any).details, hint: (error as any).hint });
      return;
    }

    // Trigger backend cost recalculation for the plan affected by deletion
    if (table === "plan_participants" && match.plan_id) {
      await recalculatePlanParticipantsCosts(client, match.plan_id).catch(err => {
        console.error(`[Backend Cost Recalculation Delete Error] Failed for plan ${match.plan_id}:`, err);
      });
    }

    console.log(`[TRACE /api/db/delete] SUCCESS — rows deleted: ${data?.length ?? 0}`);
    res.json({ success: true, count: data?.length || 0, data });
  } catch (error: any) {
    console.error("[Supabase Sync Proxy Error]:", error);
    res.status(500).json({ error: error.message || "Internal server error deleting database changes." });
  }
});


router.post("/reset", async (req, res) => {
  try {
    if (env.NODE_ENV !== "development") {
      res.status(403).json({ error: "Development only" });
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      res.json({ success: true, message: "No Supabase client configured. Local reset only." });
      return;
    }

    const { error: truncateError } = await client.rpc("truncate_all_tables");
    if (truncateError) {
      console.warn("[Supabase Reset Warning] Failed to truncate tables via RPC:", truncateError);
    }

    const { error: seqError } = await client.rpc("reset_all_sequences");
    if (seqError) {
      console.warn("[Supabase Reset Warning] Failed to reset sequential counters:", seqError);
    }

    // Re-seed system user to allow foreign keys to match
    const systemUserUuid = "00000000-0000-4000-a000-000000000000";
    await client.from("users").upsert([{
      id: systemUserUuid,
      user_id: "U_SYSTEM",
      full_name: "System User",
      username: "system",
      phone_number: "+0000000000",
      college_or_work: "System",
      wallet_balance: 0,
      active_status: true
    }]);


    res.json({ success: true, message: "Supabase database truncated, default test data seeded, and sequential counters reset successfully!" });
  } catch (err: any) {
    console.error("[Supabase Reset Error]:", err);
    res.status(500).json({ error: err.message || "Failed to reset Supabase database." });
  }
});

router.post("/delete-users", async (req, res) => {
  try {
    if (env.NODE_ENV !== "development") {
      res.status(403).json({ error: "Development only" });
      return;
    }
    const client = getSupabaseClient();
    if (!client) {
      res.status(503).json({ error: "Supabase client not configured." });
      return;
    }

    const { error: truncateError } = await client.rpc("truncate_all_tables");
    if (truncateError) {
      console.warn("[Supabase Delete Users Warning] Failed to truncate tables via RPC:", truncateError);
    }

    const { error: seqError } = await client.rpc("reset_all_sequences");
    if (seqError) {
      console.warn("[Supabase Delete Users Warning] Failed to reset sequential counters:", seqError);
    }

    // Re-seed system user to allow foreign keys to match
    const systemUserUuid = "00000000-0000-4000-a000-000000000000";
    await client.from("users").upsert([{
      id: systemUserUuid,
      user_id: "U_SYSTEM",
      full_name: "System User",
      username: "system",
      phone_number: "+0000000000",
      college_or_work: "System",
      wallet_balance: 0,
      active_status: true
    }]);


    res.json({ success: true, message: "All user-related data deleted, default test data seeded, and sequential counters reset successfully." });
  } catch (err: any) {
    console.error("[Supabase Delete Users Error]:", err);
    res.status(500).json({ error: err.message || "Failed to delete user data." });
  }
});

/**
 * POST /api/db/recalculate-wallet
 * Directly triggers wallet expense recalculation for a given plan.
 * Does NOT require a plan_participants payload — avoids the dummy-UUID pattern.
 */
router.post("/recalculate-wallet", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const { plan_id } = req.body;
    if (!plan_id || !isUuid(plan_id)) {
      res.status(400).json({ error: "Missing or invalid plan_id UUID." });
      return;
    }

    const client = getSupabaseClient(req.token);
    if (!client) {
      res.status(503).json({ error: "Supabase client not initialized." });
      return;
    }

    await recalculatePlanParticipantsCosts(client, plan_id).catch(err => {
      console.error(`[recalculate-wallet] Failed for plan ${plan_id}:`, err);
    });

    res.json({ success: true, plan_id });
  } catch (error: any) {
    console.error("[recalculate-wallet] Unexpected error:", error);
    res.status(500).json({ error: error.message || "Internal server error." });
  }
});

export default router;
