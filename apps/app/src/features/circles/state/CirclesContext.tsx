import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo, useEffect, useRef } from "react";
import { Circle, DbCircle, DbCircleMember, User } from "../../../core/types";
import { mapCirclesToLegacyCircles } from "../../../../lib/mappers";
import { insertCircle, insertCircleMembers, syncUserStats, deleteCircleMember } from "../../../../lib/db";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { supabase } from "../../../../lib/supabaseClient";
import { trackEvent } from "../../../../lib/analytics";



interface CirclesState {
  circles: Circle[];
  setCircles: React.Dispatch<React.SetStateAction<Circle[]>>;
  dbCircles: DbCircle[];
  setDbCircles: React.Dispatch<React.SetStateAction<DbCircle[]>>;
  dbCircleMembers: DbCircleMember[];
  setDbCircleMembers: React.Dispatch<React.SetStateAction<DbCircleMember[]>>;
  createCircle: (name: string, description: string, image: string, selectedFriendIds: string[], activeUserId: string, dbUsers: User[]) => Circle;
  removeCircleMember: (circleId: string, memberUserUuid: string) => Promise<void>;
  updateCircleMemberRole: (circleId: string, memberUserUuid: string, newRole: "admin" | "member") => Promise<void>;
  transferCircleHost: (circleId: string, targetUserUuid: string) => Promise<void>;
  updateCircle: (params: {
    circleId: string;
    name: string;
    description: string;
    coverImage?: string | null;
    planCreationPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    addMembersPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    editInfoPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    removeMembersPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    manageRolesPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    allowAutoJoin?: boolean;
    allowMemberEdit?: boolean;
    allowMemberHost?: boolean;
    allowMemberInvite?: boolean;
  }) => Promise<void>;
  updateCircleMemberPreference: (circleId: string, userUuid: string, autoJoinEnabled: boolean) => Promise<void>;
  deleteCircle: (circleId: string) => Promise<void>;
  refreshCircles: (targetTables?: string[]) => Promise<void>;
  insertCircleSystemMessage?: (circleId: string, content: string, actorUuid: string | null) => Promise<void>;
}

const CirclesContext = createContext<CirclesState | undefined>(undefined);

export const CirclesProvider = ({
  children,
  userId = ""
}: {
  children: ReactNode;
  userId?: string;
}) => {
  const [dbCircles, setDbCircles] = useState<DbCircle[]>([]);
  const [dbCircleMembers, setDbCircleMembers] = useState<DbCircleMember[]>([]);

  const [circles, setCircles] = useState<Circle[]>([]);

  const { dbUsers } = useProfileStore();

  const refreshCircles = useCallback(async (_targetTables?: string[]) => {
    // Circles feature disabled: no database calls to circles or circle_members
    setDbCircles([]);
    setDbCircleMembers([]);
  }, []);

  // Reactive Pipeline to derive mapped legacy circles
  useEffect(() => {
    setCircles([]);
  }, []);

  const createCircle = (
    name: string,
    description: string,
    image: string,
    selectedFriendIds: string[],
    activeUserId: string,
    dbUsers: User[]
  ) => {
    const circleId = `C_${Date.now()}`;
    const newDbCircle: DbCircle = {
      circle_id: circleId,
      name,
      description,
      category: "custom",
      created_by: activeUserId,
      cover_image: image,
      location_anchor: "Third Wave Coffee",
      privacy: "private",
      created_at: new Date().toISOString()
    };

    const activeUserObj = dbUsers.find(u => u.user_id === activeUserId || (u as any).id === activeUserId);
    const activeUserUuid = activeUserObj ? (activeUserObj as any).id : activeUserId;

    // Database insertion trigger (background promise execution)
    const persistCircle = async () => {
      try {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const isUuid = (val: any) => typeof val === "string" && uuidRegex.test(val);

        if (!activeUserUuid || !isUuid(activeUserUuid)) {
          console.error(`[CirclesContext] Cannot insert circle: creator user UUID is missing or invalid:`, activeUserUuid);
          return;
        }

        const savedCircle = await insertCircle({
          circle_id: newDbCircle.circle_id,
          name: newDbCircle.name,
          description: newDbCircle.description,
          category: newDbCircle.category,
          created_by: activeUserUuid,
          cover_image: newDbCircle.cover_image,
          location_anchor: newDbCircle.location_anchor,
          privacy: newDbCircle.privacy,
          created_at: newDbCircle.created_at
        });

        if (savedCircle && savedCircle.id) {
          const circleUuid = savedCircle.id;

          // Track circle created analytics event
          trackEvent("circle_created", { circle_id: circleUuid });

          // Track invite sent analytics event if friends were invited
          if (selectedFriendIds.length > 0) {
            trackEvent("invite_sent", {
              circle_id: circleUuid,
              invitee_count: selectedFriendIds.length
            });
          }

          const membersToInsert = [
            {
              circle_id: circleUuid,
              user_id: activeUserUuid,
              role: "admin" as const,
              joined_at: new Date().toISOString()
            },
            ...selectedFriendIds.map(fid => {
              const uObj = dbUsers.find(u => u.user_id === fid || (u as any).id === fid);
              const uUuid = uObj ? (uObj as any).id : fid;
              return {
                circle_id: circleUuid,
                user_id: uUuid,
                role: "member" as const,
                joined_at: new Date().toISOString()
              };
            })
          ].filter(m => {
            if (!m.user_id || !isUuid(m.user_id)) {
              console.error(`[CirclesContext] Skipping circle member insert: user_id is missing or not a valid UUID:`, m.user_id);
              return false;
            }
            return true;
          });

          if (membersToInsert.length > 0) {
            await insertCircleMembers(membersToInsert);

            // Update statistics: increment circles_joined for all members
            for (const m of membersToInsert) {
              await syncUserStats(m.user_id, "join_circle");
              const joinedUser = dbUsers.find(u => u.id === m.user_id || u.user_id === m.user_id || (u as any).dbUuid === m.user_id);
              const userName = joinedUser?.full_name || "Someone";
              await insertCircleSystemMessage(circleUuid, `${userName} joined the circle`, m.user_id);
            }
          } else {
            console.warn(`[CirclesContext] No valid members to insert into circle_members.`);
          }
        }
      } catch (err) {
        console.error("[Circles] Failed to persist circle to database:", err);
      }
    };
    persistCircle();

    const newMembers: DbCircleMember[] = ([
      {
        circle_member_id: `CM_self_${Date.now()}`,
        circle_id: circleId,
        user_id: activeUserUuid,
        role: "admin",
        joined_at: new Date().toISOString()
      },
      ...selectedFriendIds.map((fid, idx) => {
        const uObj = dbUsers.find(u => u.user_id === fid || (u as any).id === fid);
        const uUuid = uObj ? (uObj as any).id : fid;
        return {
          circle_member_id: `CM_friend_${idx}_${Date.now()}`,
          circle_id: circleId,
          user_id: uUuid,
          role: "member" as const,
          joined_at: new Date().toISOString()
        };
      })
    ] as any[]);

    setDbCircles(prev => [...prev, newDbCircle]);
    setDbCircleMembers(prev => [...prev, ...newMembers]);

    // Map new legacy Circle
    const allMembersList = newMembers.map(cmr => {
      const u = dbUsers.find(usr => usr.user_id === cmr.user_id || (usr as any).id === cmr.user_id);
      return {
        userId: cmr.user_id,
        name: u?.full_name || "Member",
        phone: u?.phone_number || "",
        avatar: u?.profile_photo || ""
      };
    });

    const newLegacyCircle: Circle = {
      id: circleId,
      dbUuid: undefined,
      name,
      membersCount: allMembersList.length,
      avatars: allMembersList.slice(0, 5).map(m => m.avatar),
      groupImage: image,
      lastSpontaneousActivity: "Upcoming plans",
      description,
      type: "Spontaneous Hangout Circle",
      location: "Third Wave Coffee",
      format: "Spontaneous Private Crew",
      playersOnField: allMembersList.length,
      timeWindow: "Flexible hours",
      membersList: allMembersList
    };

    return newLegacyCircle;
  };

  const insertCircleSystemMessage = async (circleId: string, content: string, actorUuid: string | null) => {
    // circle_messages is deprecated in V2.

    return;
  };

  const removeCircleMember = async (circleId: string, memberUserUuid: string) => {
    const isUuid = (val: string) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    // 1. Find the circle
    const circleObj = dbCircles.find(c => c.id === circleId || c.circle_id === circleId);
    if (!circleObj) {
      throw new Error("Circle not found");
    }

    const circleUuid = circleObj.id;
    if (!circleUuid || !isUuid(circleUuid)) {
      throw new Error("Invalid or missing database UUID for circle.");
    }

    // 2. Validate permission
    const actorMember = dbCircleMembers.find(cm => (cm.circle_id === circleUuid || cm.circle_id === circleId) && cm.user_id === userId);
    const isActorAdmin = actorMember?.role === "admin" || circleObj.created_by === userId;

    if (!isActorAdmin) {
      throw new Error("Unauthorized: Only Admins can remove members.");
    }

    const targetMember = dbCircleMembers.find(cm => (cm.circle_id === circleUuid || cm.circle_id === circleId) && cm.user_id === memberUserUuid);
    const isTargetCreator = circleObj.created_by === memberUserUuid;
    const isTargetAdmin = targetMember?.role === "admin";

    if (isTargetCreator) {
      throw new Error("Circle Creator cannot be removed.");
    }

    if (actorMember?.role === "admin" && isTargetAdmin) {
      throw new Error("Admins cannot remove other Admins.");
    }

    if (memberUserUuid === userId) {
      throw new Error("You cannot remove yourself.");
    }

    // 3. Delete member row

    const deleteSuccess = await deleteCircleMember(circleUuid, memberUserUuid);
    if (!deleteSuccess) {
      throw new Error("Failed to delete member row from database.");
    }



    // Phase 7: System message for leaving circle
    const targetUser = dbUsers.find(u => u.id === memberUserUuid || u.user_id === memberUserUuid || (u as any).dbUuid === memberUserUuid);
    const targetName = targetUser?.name || targetUser?.full_name || "Someone";
    await insertCircleSystemMessage(circleUuid, `${targetName} left the circle`, memberUserUuid);

    // 5. Update local React states immediately
    setDbCircleMembers(prev => prev.filter(m => !(m.circle_id === circleUuid && m.user_id === memberUserUuid)));
  };

  const updateCircleMemberRole = async (circleId: string, memberUserUuid: string, newRole: "admin" | "member") => {
    const isUuid = (val: string) => typeof val === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const circleObj = dbCircles.find(c => c.id === circleId || c.circle_id === circleId);
    if (!circleObj) throw new Error("Circle not found");

    const circleUuid = circleObj.id;
    if (!circleUuid || !isUuid(circleUuid)) {
      throw new Error("Invalid or missing database UUID for circle.");
    }

    // Only admin can promote/demote (dbCircleMembers stores canonical roles)
    const actorMember = dbCircleMembers.find(cm => (cm.circle_id === circleUuid || cm.circle_id === circleId) && cm.user_id === userId);
    const actorRoleLower = String(actorMember?.role || "").toLowerCase();
    const isActorAdmin = actorRoleLower === "admin" || circleObj.created_by === userId;

    if (!isActorAdmin) {
      throw new Error("Unauthorized: Only Admins can manage roles.");
    }

    if (memberUserUuid === circleObj.created_by) {
      throw new Error("Cannot change role of the Circle Creator.");
    }

    // Find the member record
    const memberRecord = dbCircleMembers.find(cm => (cm.circle_id === circleUuid || cm.circle_id === circleId) && cm.user_id === memberUserUuid);
    if (!memberRecord) throw new Error("Member not found in circle.");

    const updatedRecord = {
      circle_id: circleUuid,
      user_id: memberUserUuid,
      role: newRole,
      joined_at: memberRecord.joined_at || new Date().toISOString()
    };

    // Upsert to DB via Supabase
    const { error: roleErr } = await (supabase as any)
      .from("circle_members")
      .upsert(updatedRecord, { onConflict: "circle_id,user_id" });
    if (roleErr) throw new Error("Failed to update role in database.");



    // Phase 7: System message for co-host promotion
    if (newRole === "admin") {
      const targetUser = dbUsers.find(u => u.id === memberUserUuid || u.user_id === memberUserUuid || (u as any).dbUuid === memberUserUuid);
      const targetName = targetUser?.name || targetUser?.full_name || "Someone";
      await insertCircleSystemMessage(circleUuid, `${targetName} promoted to Admin`, memberUserUuid);
    }

    // Update local React state using canonical roles directly
    setDbCircleMembers(prev => prev.map(m => (m.circle_id === circleUuid || m.circle_id === circleId) && m.user_id === memberUserUuid ? { ...m, role: newRole } : m));
  };

  const transferCircleHost = async (circleId: string, targetUserUuid: string) => {
    const circleObj = dbCircles.find(c => c.id === circleId || c.circle_id === circleId);
    if (!circleObj) throw new Error("Circle not found");
    const circleUuid = circleObj.id || circleObj.circle_id;

    // 1. Only the current creator can transfer
    const isActorCreator = circleObj.created_by === userId;

    if (!isActorCreator) {
      throw new Error("Unauthorized: Only the Circle Creator can transfer ownership.");
    }

    if (targetUserUuid === userId) {
      throw new Error("You are already the Circle Host.");
    }

    // Find the target member record
    const targetMember = dbCircleMembers.find(cm => (cm.circle_id === circleUuid || cm.circle_id === circleId) && cm.user_id === targetUserUuid);
    if (!targetMember) {
      throw new Error("Target user is not a member of this circle.");
    }

    if (targetMember.role !== "admin") {
      throw new Error("Ownership can only be transferred to an Admin.");
    }

    // Find the old host member record
    const oldHostMember = dbCircleMembers.find(cm => (cm.circle_id === circleUuid || cm.circle_id === circleId) && cm.user_id === circleObj.created_by);
    if (!oldHostMember) {
      throw new Error("Current host member record not found.");
    }

    // Atomically transfer host ownership via Supabase RPC
    const { error: rpcErr } = await (supabase as any).rpc("transfer_circle_ownership", {
      p_circle_id: circleUuid,
      p_old_host_id: userId,
      p_new_host_id: targetUserUuid
    });
    if (rpcErr) throw new Error("Failed to transfer host ownership in database.");

    // Send notifications


    // Phase 7: System message for host transfer
    const targetUser = dbUsers.find(u => u.id === targetUserUuid || u.user_id === targetUserUuid || (u as any).dbUuid === targetUserUuid);
    const targetName = targetUser?.name || targetUser?.full_name || "Someone";
    await insertCircleSystemMessage(circleUuid, `Host transferred to ${targetName}`, targetUserUuid);

    // Update local React state.
    setDbCircles(prev => prev.map(c => (c.id === circleUuid || c.circle_id === circleId) ? { ...c, created_by: targetUserUuid } : c));

    setDbCircleMembers(prev => prev.map(m => {
      if ((m.circle_id === circleUuid || m.circle_id === circleId)) {
        if (m.user_id === targetUserUuid) return { ...m, role: "admin" };
        if (m.user_id === circleObj.created_by) return { ...m, role: "admin" };
      }
      return m;
    }));
  };

  const updateCircle = async (params: {
    circleId: string;
    name: string;
    description: string;
    coverImage?: string | null;
    planCreationPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    addMembersPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    editInfoPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    removeMembersPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    manageRolesPermission?: "ANYONE" | "HOSTS_ONLY" | "HOST_ONLY";
    allowAutoJoin?: boolean;
    allowMemberEdit?: boolean;
    allowMemberHost?: boolean;
    allowMemberInvite?: boolean;
  }) => {
    const {
      circleId,
      name,
      description,
      coverImage,
      planCreationPermission,
      addMembersPermission,
      editInfoPermission,
      removeMembersPermission,
      manageRolesPermission,
      allowAutoJoin,
      allowMemberEdit,
      allowMemberHost,
      allowMemberInvite
    } = params;

    const circleObj = dbCircles.find(c => c.id === circleId || c.circle_id === circleId);
    if (!circleObj) throw new Error("Circle not found");
    const circleUuid = circleObj.id;

    // Call Supabase upsert to update fields
    const updatedRecord = {
      ...circleObj,
      name,
      description,
      ...(coverImage !== undefined ? { cover_image: coverImage } : {}),
      ...(planCreationPermission !== undefined ? { plan_creation_permission: planCreationPermission } : {}),
      ...(addMembersPermission !== undefined ? { add_members_permission: addMembersPermission } : {}),
      ...(editInfoPermission !== undefined ? { edit_info_permission: editInfoPermission } : {}),
      ...(removeMembersPermission !== undefined ? { remove_members_permission: removeMembersPermission } : {}),
      ...(manageRolesPermission !== undefined ? { manage_roles_permission: manageRolesPermission } : {}),
      ...(allowAutoJoin !== undefined ? { allow_auto_join: allowAutoJoin } : {}),
      ...(allowMemberEdit !== undefined ? { allow_member_edit: allowMemberEdit } : {}),
      ...(allowMemberHost !== undefined ? { allow_member_host: allowMemberHost } : {}),
      ...(allowMemberInvite !== undefined ? { allow_member_invite: allowMemberInvite } : {})
    };
    // Update via Supabase directly
    const { error: circleErr } = await (supabase as any)
      .from("circles")
      .upsert(updatedRecord);
    if (circleErr) {
      throw new Error("Failed to persist circle edits to database.");
    }

    // Update local state
    setDbCircles(prev => prev.map(c => (c.id === circleUuid || c.circle_id === circleId) ? updatedRecord : c));
  };

  const updateCircleMemberPreference = async (circleId: string, userUuid: string, autoJoinEnabled: boolean) => {
    const circleObj = dbCircles.find(c => c.id === circleId || c.circle_id === circleId);
    if (!circleObj) throw new Error("Circle not found");
    const circleUuid = circleObj.id;

    const memberRecord = dbCircleMembers.find(cm => cm.circle_id === circleUuid && cm.user_id === userUuid);
    if (!memberRecord) throw new Error("Circle member record not found");

    const updatedRecord = {
      circle_id: circleUuid,
      user_id: userUuid,
      role: memberRecord.role,
      auto_join_enabled: autoJoinEnabled,
      joined_at: memberRecord.joined_at || new Date().toISOString()
    };

    const { error: prefErr } = await (supabase as any)
      .from("circle_members")
      .upsert(updatedRecord, { onConflict: "circle_id,user_id" });
    if (prefErr) throw new Error("Failed to update auto join preference in database.");

    setDbCircleMembers(prev => prev.map(m => (m.circle_id === circleUuid && m.user_id === userUuid) ? updatedRecord : m));
  };

  const deleteCircle = async (circleId: string) => {
    const circleObj = dbCircles.find(c => c.id === circleId || c.circle_id === circleId);
    if (!circleObj) throw new Error("Circle not found");
    const circleUuid = circleObj.id;

    const { error: delErr } = await (supabase as any)
      .from("circles")
      .delete()
      .eq("id", circleUuid);
    if (delErr) {
      throw new Error("Failed to delete circle from database.");
    }

    // Update local state
    setDbCircles(prev => prev.filter(c => c.id !== circleUuid));
    setDbCircleMembers(prev => prev.filter(m => m.circle_id !== circleUuid));
  };

  const memoizedCreateCircle = useCallback(createCircle, []);
  const memoizedRemoveCircleMember = useCallback(removeCircleMember, [dbCircles, dbCircleMembers, userId]);
  const memoizedUpdateCircleMemberRole = useCallback(updateCircleMemberRole, [dbCircles, dbCircleMembers, userId]);
  const memoizedTransferCircleHost = useCallback(transferCircleHost, [dbCircles, dbCircleMembers, userId]);
  const memoizedUpdateCircle = useCallback(updateCircle, [dbCircles]);
  const memoizedUpdateCircleMemberPreference = useCallback(updateCircleMemberPreference, [dbCircles, dbCircleMembers]);
  const memoizedDeleteCircle = useCallback(deleteCircle, [dbCircles]);

  const contextValue = useMemo(() => ({
    circles, setCircles,
    dbCircles, setDbCircles,
    dbCircleMembers, setDbCircleMembers,
    createCircle: memoizedCreateCircle,
    removeCircleMember: memoizedRemoveCircleMember,
    updateCircleMemberRole: memoizedUpdateCircleMemberRole,
    transferCircleHost: memoizedTransferCircleHost,
    updateCircle: memoizedUpdateCircle,
    updateCircleMemberPreference: memoizedUpdateCircleMemberPreference,
    deleteCircle: memoizedDeleteCircle,
    refreshCircles,
    insertCircleSystemMessage
  }), [
    circles, dbCircles, dbCircleMembers,
    memoizedCreateCircle, memoizedRemoveCircleMember,
    memoizedUpdateCircleMemberRole, memoizedTransferCircleHost,
    memoizedUpdateCircle, memoizedUpdateCircleMemberPreference, memoizedDeleteCircle,
    refreshCircles,
    insertCircleSystemMessage
  ]);

  return (
    <CirclesContext.Provider value={contextValue}>
      {children}
    </CirclesContext.Provider>
  );
};

export const useCirclesStore = () => {
  const context = useContext(CirclesContext);
  if (context === undefined) {
    throw new Error("useCirclesStore must be used within a CirclesProvider");
  }
  return context;
};
