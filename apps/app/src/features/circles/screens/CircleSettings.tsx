import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, ChevronRight, UserPlus, Trash2, Edit3, Bell, Eye, LogOut,
  Info, Shield, Check, Users, Search, X, MoreVertical, ShieldAlert, Sparkles, Award, UserX, Crown, Plus, Save, Camera, Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCirclesStore } from "../state/CirclesContext";
import { useProfileStore } from "../../profile/state/ProfileContext";
import { useToast } from "../../../shared/contexts/ToastContext";
import { UserAvatar } from "../../../IMGfromDB/UserAvatar";
import { CircleAvatar } from "../../../shared/components/CircleAvatar";
import { useProfileUpload } from "../../profile/hooks/useProfileUpload";
import { CirclePermissions } from "./CirclePermissions";
import { SUPABASE_URL } from "../../../../lib/supabaseClient";
export const CircleDetailScreen = (props: any) => {
  const {
    circle,
    plans,
    activeUserId,
    onBack,                  // back to CircleChatScreen
    setCircles,
    setSelectedCircle,
    dbUsers,
    onAddMembers,
  } = props;

  const { circles, dbCircles, removeCircleMember, updateCircleMemberRole, transferCircleHost, updateCircle, updateCircleMemberPreference, deleteCircle } = useCirclesStore();
  const { activeUserUuid } = useProfileStore();
  const { uploading, uploadError, uploadImage } = useProfileUpload();

  const freshCircle = circles.find((c: any) => c.id === circle.id || c.dbUuid === circle.id || c.id === circle.dbUuid) || circle;
  const dbCircle = dbCircles.find(c => c.id === freshCircle.dbUuid || c.circle_id === freshCircle.id);

  // Notification states
  const [notifSound, setNotifSound] = useState(true);
  const [notifMuted, setNotifMuted] = useState(false);

  // Sync details & editable states
  const [isEditingName, setIsEditingName] = useState(false);
  const [circleNameInput, setCircleNameInput] = useState(freshCircle.name);

  // Segmented group description state
  const description = freshCircle.tagline || freshCircle.description || '';
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [descriptionInput, setDescriptionInput] = useState(freshCircle.tagline || freshCircle.description || '');

  // Members mapped from freshCircle.membersList using useMemo
  const members = useMemo(() => {
    const rawMembers = (freshCircle.membersList || []).map((m: any) => {
      const uObj = dbUsers.find((u: any) => u.id === m.userId || u.user_id === m.userId);
      return {
        id: m.userId,
        name: uObj?.full_name || m.name,
        avatar: uObj?.profile_photo || m.avatar,
        status: uObj?.bio || m.phone || 'Spontaneous and active ⚡',
        role: (m.role === 'creator_admin' || m.role === 'host' || m.role === 'admin') ? 'Admin'
            : 'Member',
        // Keep raw role for permission logic
        rawRole: m.role as string,
      };
    });

    // Order: Creator first, then Admins (alphabetical), then Members (alphabetical)
    const creators = rawMembers.filter(m => m.id === dbCircle?.created_by);
    const admins = rawMembers.filter(m => m.role === 'Admin' && m.id !== dbCircle?.created_by).sort((a, b) => a.name.localeCompare(b.name));
    const regular = rawMembers.filter(m => m.role === 'Member').sort((a, b) => a.name.localeCompare(b.name));

    return [...creators, ...admins, ...regular];
  }, [freshCircle.membersList, dbUsers]);

  // Local state for actions menus & search
  const [selectedMemberForActions, setSelectedMemberForActions] = useState<any | null>(null);
  const [showAddMembersModal, setShowAddMembersModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [toastText, setToastText] = useState<string | null>(null);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const [showPermissionsSubScreen, setShowPermissionsSubScreen] = useState(false);

  // Modals confirmation states
  const [memberToRemove, setMemberToRemove] = useState<any | null>(null);
  const [memberToTransferHost, setMemberToTransferHost] = useState<any | null>(null);
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);
  const [showHostBlockLeaveModal, setShowHostBlockLeaveModal] = useState(false);
  const [chosenNewHostForLeave, setChosenNewHostForLeave] = useState<any | null>(null);
  const [showHostTransferLeaveConfirmModal, setShowHostTransferLeaveConfirmModal] = useState(false);
  const [showDeleteCircleConfirmModal, setShowDeleteCircleConfirmModal] = useState(false);

  const { showToast } = useToast();

  const triggerToast = (text: string) => {
    showToast(text);
    // Also update local state for the bottom-positioned toast in this screen
    setToastText(text);
    setTimeout(() => {
      setToastText(null);
    }, 3500);
  };

  const isMe = (userId: string) => {
    const resolvedUserUuid = activeUserUuid || activeUserId;
    return userId === resolvedUserUuid;
  };

  const myMember = members.find(m => m.id === (activeUserUuid || activeUserId));
  // isCreatorAdmin: the original creator — has full permissions
  const myRawRole = (freshCircle.membersList || []).find((m: any) => m.userId === (activeUserUuid || activeUserId))?.role || '';
  const isCreator = dbCircle?.created_by === (activeUserUuid || activeUserId);
  const isCreatorAdmin = isCreator;
  const isAdmin = isCreator || myRawRole === 'admin' || myRawRole === 'co_host';
  // Alias for template readability
  const isHostOrCoHost = isAdmin; // kept for backward compat with template refs
  const isHost = isCreatorAdmin;  // controls delete-circle / transfer-ownership buttons
  const isCoHost = isAdmin && !isCreatorAdmin;
  const canEditDetails = isHost || !!freshCircle.allow_member_edit;
  const canAddMembers = isAdmin || !!freshCircle.allow_member_invite;

  const handleEditAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const pathResult = await uploadImage(file, activeUserUuid || activeUserId);
    if (pathResult) {
      try {
        const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${pathResult}`;
        const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
        await updateCircle({ circleId: targetCircleUuid, name: circleNameInput, description: descriptionInput, coverImage: publicUrl });
        const updated = {
          ...freshCircle,
          groupPhoto: publicUrl,
          groupImage: publicUrl,
          cover_image: publicUrl
        };
        setCircles?.((prev: any[]) => prev.map(c => c.id === freshCircle.id ? updated : c));
        setSelectedCircle?.(updated);
        triggerToast('Circle profile photo updated');
      } catch (err: any) {
        triggerToast(`Failed to save image: ${err.message || err}`);
      }
    }
  };

  const handleSaveName = async () => {
    if (!circleNameInput.trim()) return;
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await updateCircle({ circleId: targetCircleUuid, name: circleNameInput.trim(), description: descriptionInput });
      const updated = { ...freshCircle, name: circleNameInput.trim() };
      setCircles?.((prev: any[]) => prev.map(c => c.id === freshCircle.id ? updated : c));
      setSelectedCircle?.(updated);
      setIsEditingName(false);
      triggerToast('Circle name updated');
    } catch (err: any) {
      triggerToast(`Error updating name: ${err.message || err}`);
    }
  };

  const handleSaveDescription = async () => {
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await updateCircle({ circleId: targetCircleUuid, name: circleNameInput, description: descriptionInput });
      setIsEditingDescription(false);
      const updated = { ...freshCircle, tagline: descriptionInput, description: descriptionInput };
      setCircles?.((prev: any[]) => prev.map(c => c.id === freshCircle.id ? updated : c));
      setSelectedCircle?.(updated);
      triggerToast('Description updated successfully');
    } catch (err: any) {
      triggerToast(`Error updating description: ${err.message || err}`);
    }
  };

  const handleRemoveDescription = async () => {
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await updateCircle({ circleId: targetCircleUuid, name: circleNameInput, description: '' });
      setDescriptionInput('');
      setIsEditingDescription(false);
      const updated = { ...freshCircle, tagline: '', description: '' };
      setCircles?.((prev: any[]) => prev.map(c => c.id === freshCircle.id ? updated : c));
      setSelectedCircle?.(updated);
      triggerToast('Description removed');
    } catch (err: any) {
      triggerToast(`Error removing description: ${err.message || err}`);
    }
  };

  // Promote Member to Admin
  const handlePromoteToAdmin = async (memberId: string, name: string) => {
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await updateCircleMemberRole(targetCircleUuid, memberId, "admin");
      const updatedMembers = freshCircle.membersList.map((m: any) => m.userId === memberId ? { ...m, role: 'admin' } : m);
      setSelectedCircle?.({ ...freshCircle, membersList: updatedMembers });
      triggerToast(`${name} is now an Admin`);
    } catch (err: any) {
      triggerToast(`Error promoting member: ${err.message || err}`);
    }
  };

  // Demote Co-host back to Member
  const handleDemoteToMember = async (memberId: string, name: string) => {
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await updateCircleMemberRole(targetCircleUuid, memberId, "member");
      const updatedMembers = freshCircle.membersList.map((m: any) => m.userId === memberId ? { ...m, role: 'member' } : m);
      setSelectedCircle?.({ ...freshCircle, membersList: updatedMembers });
      triggerToast(`${name} has been demoted to Member`);
    } catch (err: any) {
      triggerToast(`Error demoting member: ${err.message || err}`);
    }
  };

  // Complete Ownership Transfer (Creator only → transfer to an Admin)
  const handleTransferHostOwnership = async (targetMember: any) => {
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await transferCircleHost(targetCircleUuid, targetMember.id);
      const updatedMembers = freshCircle.membersList.map((m: any) => {
        if (m.userId === targetMember.id) return { ...m, role: 'admin' };
        if (m.userId === (activeUserUuid || activeUserId)) return { ...m, role: 'admin' };
        return m;
      });
      setSelectedCircle?.({ ...freshCircle, created_by: targetMember.id, membersList: updatedMembers });
      setMemberToTransferHost(null);
      triggerToast(`${targetMember.name} is now the Admin of this circle`);
    } catch (err: any) {
      triggerToast(`Error transferring ownership: ${err.message || err}`);
    }
  };

  // Remove a member from the circle
  const handleRemoveMemberFinal = async () => {
    if (!memberToRemove) return;
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await removeCircleMember(targetCircleUuid, memberToRemove.id);
      const updatedMembers = freshCircle.membersList.filter((m: any) => m.userId !== memberToRemove.id);
      setSelectedCircle?.({
        ...freshCircle,
        membersList: updatedMembers,
        membersCount: updatedMembers.length,
        avatars: updatedMembers.slice(0, 5).map((m: any) => m.avatar)
      });
      triggerToast(`${memberToRemove.name} was removed from the circle`);
      setMemberToRemove(null);
    } catch (err: any) {
      triggerToast(`Error removing member: ${err.message || err}`);
    }
  };

  // Add selected members to the Circle
  const handleAddMemberToCircle = (user: { user_id: string; full_name: string; profile_photo: string }) => {
    // Navigate back to members add flow
    if (onAddMembers) {
      onAddMembers();
      setShowAddMembersModal(false);
    }
  };

  // Handle Logged In User Leaving circle
  const handleLeaveCircleAction = () => {
    const otherAdmins = members.filter(m => m.role === 'Admin' && m.id !== (activeUserUuid || activeUserId));
    if (isCreatorAdmin && otherAdmins.length === 0) {
      setShowHostBlockLeaveModal(true);
    } else {
      setShowLeaveConfirmModal(true);
    }
  };

  // Host transfers ownership and leaves in one action
  const handleTransferAndLeaveFinal = async () => {
    if (!chosenNewHostForLeave) return;
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await transferCircleHost(targetCircleUuid, chosenNewHostForLeave.id);
      await removeCircleMember(targetCircleUuid, activeUserUuid || activeUserId);
      setCircles?.((prev: any[]) => prev.filter(c => c.id !== freshCircle.id));
      setSelectedCircle?.(null);
      setShowHostTransferLeaveConfirmModal(false);
      setShowHostBlockLeaveModal(false);
      onBack();
      triggerToast(`Transferred host to ${chosenNewHostForLeave.name} and left circle.`);
    } catch (err: any) {
      triggerToast(`Error leaving circle: ${err.message || err}`);
    }
  };

  const handleLeaveCircle = async () => {
    try {
      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
      await removeCircleMember(targetCircleUuid, activeUserUuid || activeUserId);
      setCircles?.((prev: any[]) => prev.filter(c => c.id !== freshCircle.id));
      setSelectedCircle?.(null);
      onBack();
      triggerToast(`Left ${freshCircle.name}.`);
    } catch (err: any) {
      triggerToast(`Error leaving circle: ${err.message || err}`);
    }
  };

  // Clean remaining search candidates
  const eligibleUsers = dbUsers.filter((u: any) => u.user_id !== activeUserId);
  const addableUsers = eligibleUsers.filter((user: any) =>
    !members.some(m => m.name === user.full_name) &&
    user.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: -25 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 25 }}
      transition={{ duration: 0.2 }}
      className="flex-1 flex flex-col h-full bg-[#050505] relative overflow-hidden select-none text-left"
    >
      {/* HEADER SECTION */}
      <div
        id="circle-settings-header"
        className="px-6 pt-6 pb-4 flex items-center justify-between border-b border-white/[0.04] bg-[#050505] sticky top-0 z-20"
      >
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-zinc-400 hover:text-white transition active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="font-sans font-black text-[16px] uppercase tracking-wider text-zinc-100 leading-none">
              Circle Settings
            </h2>
          </div>
        </div>
      </div>

      {/* CORE WRAPPER */}
      <div className="flex-1 overflow-y-auto scrollbar-none px-6 pt-8 pb-32 space-y-9">

        {/* 1. CIRCLE HEADER */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative">
            <div
              onClick={() => setShowPhotoViewer(true)}
              className="w-20 h-20 rounded-full overflow-hidden bg-zinc-900 shadow-sm relative group cursor-pointer hover:opacity-90"
            >
              <CircleAvatar
                src={freshCircle.groupPhoto || freshCircle.groupImage || freshCircle.cover_image || (freshCircle as any).group_photo}
                alt={freshCircle.name}
                size="w-full h-full"
                className="object-cover"
              />
              {uploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {canEditDetails && (
              <button
                type="button"
                onClick={() => !uploading && document.getElementById('settings_circle_avatar_input')?.click()}
                className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-[#121217] border border-white/[0.08] hover:border-[#FF6B2C]/40 transition flex items-center justify-center text-zinc-400 hover:text-[#FF6B2C] shadow-lg cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {canEditDetails && (
            <input
              id="settings_circle_avatar_input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleEditAvatarChange}
            />
          )}

          <div className="space-y-0.5">
            {isEditingName ? (
              <div className="flex items-center gap-2 justify-center max-w-xs mx-auto">
                <input
                  type="text"
                  value={circleNameInput}
                  onChange={(e) => setCircleNameInput(e.target.value)}
                  onBlur={handleSaveName}
                  className="bg-[#0E0E12] border border-white/[0.08] focus:border-[#FF6B2C]/40 text-center text-[17px] font-sans font-bold rounded-lg px-2.5 py-1 text-white outline-none"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                  autoFocus
                />
              </div>
            ) : (
              <div
                onClick={() => canEditDetails && setIsEditingName(true)}
                className={`flex items-center justify-center gap-1.5 ${canEditDetails ? 'cursor-pointer hover:opacity-80' : ''}`}
              >
                <h3 className="text-[17px] font-sans font-black text-zinc-100 tracking-wide leading-none">
                  {freshCircle.name}
                </h3>
                {canEditDetails && <Pencil className="w-3.5 h-3.5 text-zinc-550 hover:text-[#FF6B2C] transition" />}
              </div>
            )}
            <p className="text-[9.5px] font-sans font-medium text-zinc-550 tracking-widest uppercase mt-0.5">
              {members.length} Members
            </p>
          </div>
        </div>

        {/* 2. ABOUT SECTION */}
        <div className="space-y-2.5 relative">
          <div className="flex items-center justify-between border-b border-white/[0.04] pb-1.5">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              About
            </h4>
            {canEditDetails && !isEditingDescription && (
              <button
                type="button"
                onClick={() => {
                  setDescriptionInput(description);
                  setIsEditingDescription(true);
                }}
                className="text-zinc-550 hover:text-[#FF6B2C] transition cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {isEditingDescription ? (
            <div className="space-y-2 max-w-sm">
              <textarea
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                onBlur={handleSaveDescription}
                placeholder="Enter Circle Description"
                rows={2}
                className="w-full bg-[#0E0E12] border border-white/[0.08] focus:border-[#FF6B2C]/40 text-sm font-sans rounded-lg px-3 py-2 text-white outline-none resize-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) handleSaveDescription(); }}
                autoFocus
              />
            </div>
          ) : (
            <div
              onClick={() => canEditDetails && setIsEditingDescription(true)}
              className={`px-1 group ${canEditDetails ? 'cursor-pointer' : ''}`}
            >
              <p className="text-[12.5px] text-zinc-400 font-sans font-medium leading-relaxed group-hover:text-zinc-200 transition">
                {freshCircle.description || freshCircle.tagline || "No description set yet. Click to add details."}
              </p>
            </div>
          )}
        </div>

        {/* 3. SETTINGS NAVIGATION SECTION */}
        {true && (
          <div className="space-y-2.5">
            <div className="px-1">
              <button
                type="button"
                onClick={() => setShowPermissionsSubScreen(true)}
                className="w-full flex items-center justify-between py-3 hover:opacity-80 transition cursor-pointer text-left"
              >
                <div>
                  <p className="text-[12.5px] font-bold text-zinc-300">Circle Permissions</p>
                  <p className="text-[10.5px] text-zinc-550 mt-0.5">Manage permissions and access controls</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-500" />
              </button>
            </div>
          </div>
        )}

        {/* 5. MEMBERS SECTION */}
        <div className="space-y-3.5">
          <div className="border-b border-white/[0.04] pb-1.5 flex items-center justify-between">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Members • {members.length}
            </h4>
          </div>

          {/* Members List Container */}
          <div className="divide-y divide-white/[0.03] space-y-0.5">
            {members.map((member, idx) => {
              const isMemberMe = isMe(member.id);
              const isTargetAdmin = member.role === 'Admin';

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedMemberForActions(member)}
                  className="flex items-center justify-between py-2.5 hover:opacity-85 transition cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <UserAvatar
                        src={member.avatar}
                        alt={member.name}
                        size="w-7 h-7"
                        className="border border-white/10"
                      />
                    </div>
                    <p className="text-[12.5px] font-sans font-bold text-zinc-300 leading-tight">
                      {member.name}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Role Badges */}
                    {isTargetAdmin ? (
                      <span className="text-[8px] font-sans font-bold tracking-wider text-[#ff8b66] bg-[#ff8b66]/10 px-1.5 py-0.5 rounded uppercase">
                        ADMIN
                      </span>
                    ) : (
                      <span className="text-[8px] font-sans font-bold tracking-wider text-zinc-500 bg-white/[0.02] px-1.5 py-0.5 rounded uppercase">
                        MEMBER
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Member Management: inline below list */}
          {canAddMembers && (
            <button
              type="button"
              onClick={onAddMembers}
              className="w-full py-2.5 mt-2 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] text-zinc-300 hover:text-white font-sans font-bold text-[11px] uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Member</span>
            </button>
          )}
        </div>

        {/* 6. ACTIONS: LEAVE / DELETE (Placed at the very bottom below Members) */}
        <div className="pt-2 space-y-3">
          <button
            type="button"
            onClick={handleLeaveCircleAction}
            className="w-full py-2.5 bg-[#FF6B2C]/5 hover:bg-[#FF6B2C]/10 border border-[#FF6B2C]/10 text-[#FF6B2C] font-sans font-bold text-[11px] uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0" />
            <span>Leave Circle</span>
          </button>

          {isHost && (
            <button
              type="button"
              onClick={() => setShowDeleteCircleConfirmModal(true)}
              className="w-full py-2.5 bg-red-600/5 hover:bg-red-650/10 border border-red-650/10 text-red-500 hover:text-red-455 font-sans font-bold text-[11px] uppercase tracking-wider rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Delete Circle</span>
            </button>
          )}
        </div>

      </div>

      {/* FLOATING ACTION NOTIFICATION TOAST */}
      <AnimatePresence>
        {toastText && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-[#121218] border border-white/10 px-4.5 py-3 rounded-2xl flex items-center gap-3 shadow-2xl max-w-xs w-full pointer-events-none text-left"
            id="circles-management-toast"
          >
            <div className="w-6 h-6 rounded-full bg-[#FF6B2C]/15 border border-[#FF6B2C]/30 flex items-center justify-center text-[#FF6B2C] shrink-0 font-bold">
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            </div>
            <p className="text-white font-sans font-black text-[10.5px] tracking-wide uppercase leading-tight">
              {toastText}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MEMBER ACTION SHEET */}
      <AnimatePresence>
        {selectedMemberForActions && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMemberForActions(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="w-full max-w-md bg-[#0D0D10] border-t border-white/10 rounded-t-[28px] p-6 space-y-4 z-[110] relative pb-10 shadow-2xl text-left"
            >
              {/* Handle bar */}
              <div className="w-12 h-1 bg-zinc-800 rounded-full mx-auto -mt-2 mb-4" />

              {/* Member details */}
              <div className="flex items-center gap-3.5 pb-2 border-b border-white/[0.04]">
                <UserAvatar
                  src={selectedMemberForActions.avatar}
                  alt={selectedMemberForActions.name}
                  size="w-10 h-10"
                  className="border border-white/10"
                />
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wide leading-tight">
                    {selectedMemberForActions.name}
                  </h4>
                  <span className="text-[10px] font-mono text-zinc-550 uppercase tracking-widest mt-1 block">
                    Role: {selectedMemberForActions.role}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMemberForActions(null);
                    showToast(`Viewing profile of ${selectedMemberForActions.name}`);
                  }}
                  className="w-full py-3 px-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] text-zinc-200 hover:text-white rounded-xl text-xs font-bold transition text-center cursor-pointer"
                >
                  View Profile
                </button>

                {/* Make Admin (Admin or Creator Admin actors, for Members only) */}
                {isAdmin && selectedMemberForActions.role === 'Member' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberForActions(null);
                      handlePromoteToAdmin(selectedMemberForActions.id, selectedMemberForActions.name);
                    }}
                    className="w-full py-3 px-4 bg-[#FF6B2C]/10 hover:bg-[#FF6B2C]/20 border border-[#FF6B2C]/20 text-[#FF6B2C] rounded-xl text-xs font-bold transition text-center cursor-pointer"
                  >
                    Make Admin
                  </button>
                )}

                {/* Demote to Member (Creator Admin actor only, for other Admins only) */}
                {isCreatorAdmin && selectedMemberForActions.role === 'Admin' && selectedMemberForActions.id !== (activeUserUuid || activeUserId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberForActions(null);
                      handleDemoteToMember(selectedMemberForActions.id, selectedMemberForActions.name);
                    }}
                    className="w-full py-3 px-4 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] text-zinc-300 rounded-xl text-xs font-bold transition text-center cursor-pointer"
                  >
                    Demote to Member
                  </button>
                )}

                {/* Transfer Ownership (Creator Admin only — to other Admins) */}
                {isCreatorAdmin && selectedMemberForActions.role === 'Admin' && selectedMemberForActions.id !== (activeUserUuid || activeUserId) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMemberForActions(null);
                      setMemberToTransferHost(selectedMemberForActions);
                    }}
                    className="w-full py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-bold transition text-center cursor-pointer"
                  >
                    Transfer Ownership
                  </button>
                )}

                {/* Remove from Circle (Admin actors — cannot remove Creator Admin; non-creator admins cannot remove other admins) */}
                {((isCreatorAdmin && selectedMemberForActions.role !== 'Admin') ||
                  (isAdmin && selectedMemberForActions.role === 'Member')) &&
                  selectedMemberForActions.id !== (activeUserUuid || activeUserId) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMemberForActions(null);
                        setMemberToRemove(selectedMemberForActions);
                      }}
                      className="w-full py-3 px-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl text-xs font-bold transition text-center cursor-pointer"
                    >
                      Remove From Circle
                    </button>
                  )}

                {/* Cancel */}
                <button
                  type="button"
                  onClick={() => setSelectedMemberForActions(null)}
                  className="w-full py-3 px-4 bg-zinc-900 hover:bg-zinc-850 border border-white/[0.03] text-zinc-400 hover:text-zinc-300 rounded-xl text-xs font-bold transition text-center cursor-pointer mt-2"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==================== ACTIVE MODALS & CONFIRMATIONS ==================== */}

      {/* CONFIRMATION DIALOG: REMOVE MEMBER */}
      <AnimatePresence>
        {memberToRemove && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMemberToRemove(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              id="remove-member-backdrop"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0C0C0E] border border-white/10 rounded-[24px] p-6 max-w-xs w-full text-center z-[110] space-y-4 shadow-3xl"
              id="remove-member-modal"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500 shrink-0">
                <UserX className="w-5 h-5 shrink-0" />
              </div>
              <div className="space-y-1.5 text-center">
                <h3 className="font-sans font-black text-sm text-zinc-100 uppercase tracking-wider">Remove member from circle?</h3>
                <p className="text-[11px] text-zinc-400 font-medium font-sans leading-relaxed">
                  Are you sure you want to remove <strong className="text-zinc-200">{memberToRemove.name}</strong>?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setMemberToRemove(null)}
                  className="bg-white/5 hover:bg-white/10 text-zinc-300 py-2.5 rounded-xl text-[10px] font-sans font-black tracking-wider uppercase transition border border-white/[0.05] cursor-pointer"
                  id="remove-member-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRemoveMemberFinal}
                  className="bg-[#E11D48] hover:bg-red-650 text-white font-sans font-black text-[10px] tracking-wider uppercase py-2.5 rounded-xl transition border border-red-500/10 cursor-pointer"
                  id="remove-member-confirm-btn"
                >
                  Remove
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION DIALOG: TRANSFER HOSTSHIP */}
      <AnimatePresence>
        {memberToTransferHost && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMemberToTransferHost(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              id="transfer-host-backdrop"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0C0C0E] border border-white/10 rounded-[24px] p-6 max-w-xs w-full text-center z-[110] space-y-4 shadow-3xl relative"
              id="transfer-host-modal"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-500 shrink-0">
                <Crown className="w-5 h-5" />
              </div>
              <div className="space-y-1.5 text-center font-sans">
                <h3 className="font-black text-sm text-zinc-100 uppercase tracking-wider">Transfer Circle Ownership?</h3>
                <p className="text-[11px] text-zinc-400 font-medium leading-relaxed">
                  <strong className="text-zinc-200">{memberToTransferHost.name}</strong> will become the new Admin.
                </p>
                <p className="text-[10px] text-[#FF6B2C] leading-relaxed font-semibold uppercase tracking-wider mt-1">
                  You will become a regular Admin.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setMemberToTransferHost(null)}
                  className="bg-white/5 hover:bg-white/10 text-zinc-300 py-2.5 rounded-xl text-[10px] font-sans font-black tracking-wider uppercase transition border border-white/[0.05] cursor-pointer"
                  id="transfer-host-cancel-btn"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleTransferHostOwnership(memberToTransferHost)}
                  className="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-sans font-black text-[10px] tracking-wider uppercase py-2.5 rounded-xl transition cursor-pointer"
                  id="transfer-host-confirm-btn"
                >
                  Transfer Host
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION DIALOG: LEAVE CIRCLE (NON-HOST) */}
      <AnimatePresence>
        {showLeaveConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLeaveConfirmModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              id="leave-backdrop"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0C0C0E] border border-white/10 rounded-[24px] p-6 max-w-xs w-full text-center z-[110] space-y-4 shadow-3xl"
              id="leave-modal"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500 shrink-0">
                <LogOut className="w-5 h-5 shrink-0" />
              </div>
              <div className="space-y-1.5 text-center font-sans">
                <h3 className="font-black text-sm text-zinc-100 uppercase tracking-wider">Leave Circle?</h3>
                <p className="text-[11.5px] text-zinc-400 font-medium leading-relaxed">
                  Are you sure you want to leave this circle?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLeaveConfirmModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-zinc-300 py-2.5 rounded-xl text-[10px] font-sans font-black tracking-wider uppercase transition border border-white/[0.05] cursor-pointer"
                  id="leave-stay-btn"
                >
                  Stay
                </button>
                <button
                  type="button"
                  onClick={handleLeaveCircle}
                  className="bg-[#E11D48] hover:bg-red-650 text-white font-sans font-black text-[10px] tracking-wider uppercase py-2.5 rounded-xl transition border border-red-500/10 cursor-pointer"
                  id="leave-confirm-btn"
                >
                  Leave Circle
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DIALOG FOR HOST LEAVING (OWNERSHIP TRANSFER REQUIRED FLOW) */}
      <AnimatePresence>
        {showHostBlockLeaveModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHostBlockLeaveModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              id="host-leave-blocker-backdrop"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0C0C0E] border border-white/10 rounded-[28px] p-6 max-w-sm w-full z-[110] space-y-4 shadow-3xl text-center relative"
              id="host-leave-blocker-modal"
            >
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-500 shrink-0">
                <Crown className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-2 font-sans text-center">
                <h3 className="font-black text-sm text-zinc-100 uppercase tracking-wider">Transfer Ownership Required</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                  As the Circle Creator Admin, you must transfer ownership to another Admin before leaving.
                </p>
              </div>

              {/* Select candidate dropdown */}
              <div className="space-y-2 pt-2 text-left">
                <label className="block text-[9px] font-mono text-zinc-500 uppercase tracking-widest font-black">
                  Select new circle Admin:
                </label>
                <div className="space-y-1.5 max-h-[130px] overflow-y-auto pr-1">
                  {members.filter(m => m.id !== (activeUserUuid || activeUserId) && m.role === 'Admin').map((m, mIdx) => (
                    <div
                      key={mIdx}
                      onClick={() => setChosenNewHostForLeave(m)}
                      className={`p-2.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${chosenNewHostForLeave?.id === m.id
                        ? 'bg-amber-500/10 border-amber-500/35'
                        : 'bg-white/[0.02] border-white/5'
                        }`}
                    >
                      <div className="flex items-center gap-2.5 text-left font-sans">
                        <UserAvatar src={m.avatar} alt={m.name} size="w-6 h-6" />
                        <div>
                          <span className="text-xs font-black text-zinc-200 block leading-tight">{m.name}</span>
                          <span className="text-[9px] text-zinc-550 block uppercase tracking-wider leading-none mt-0.5">{m.role}</span>
                        </div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all ${chosenNewHostForLeave?.id === m.id ? 'bg-amber-500 border-amber-500' : 'border-zinc-700'
                        }`}>
                        {chosenNewHostForLeave?.id === m.id && <Check className="w-2.5 h-2.5 text-zinc-950 stroke-[3.5]" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions row */}
              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowHostBlockLeaveModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-zinc-300 py-2.5 rounded-xl text-[10px] font-sans font-black tracking-wider uppercase transition border border-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!chosenNewHostForLeave}
                  onClick={() => setShowHostTransferLeaveConfirmModal(true)}
                  className={`py-2.5 rounded-xl text-[10px] font-sans font-black tracking-wider uppercase transition ${chosenNewHostForLeave
                    ? 'bg-amber-500 hover:bg-amber-600 text-zinc-950 font-extrabold cursor-pointer shadow-lg shadow-amber-500/5'
                    : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                >
                  Transfer & Leave
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION NESTED OVERLAY: TRANSFER AND LEAVE */}
      <AnimatePresence>
        {showHostTransferLeaveConfirmModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHostTransferLeaveConfirmModal(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              id="host-leave-nested-backdrop"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0C0C0E] border border-white/10 rounded-[24px] p-6 max-w-xs w-full text-center z-[130] space-y-4 shadow-3xl relative"
              id="host-leave-nested-modal"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500 shrink-0">
                <ShieldAlert className="w-5 h-5 animate-bounce" />
              </div>
              <div className="space-y-1.5 text-center font-sans">
                <h3 className="font-black text-sm text-zinc-150 uppercase tracking-wider">Are you absolutely sure?</h3>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">
                  This will transfer primary Admin credentials to <strong className="text-zinc-200">{chosenNewHostForLeave?.name}</strong> and remove you from this circle.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowHostTransferLeaveConfirmModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-zinc-300 py-2.5 rounded-xl text-[10px] font-sans font-black tracking-wider uppercase transition border border-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleTransferAndLeaveFinal}
                  className="bg-[#E11D48] hover:bg-red-650 text-white font-sans font-black text-[10px] tracking-wider uppercase py-2.5 rounded-xl transition border border-red-500/10 cursor-pointer"
                >
                  Confirm Exit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CONFIRMATION DIALOG: DELETE CIRCLE */}
      <AnimatePresence>
        {showDeleteCircleConfirmModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteCircleConfirmModal(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-sm"
              id="delete-circle-backdrop"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0C0C0E] border border-white/10 rounded-[24px] p-6 max-w-xs w-full text-center z-[110] space-y-4 shadow-3xl relative"
              id="delete-circle-modal"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500 shrink-0">
                <Trash2 className="w-5 h-5 shrink-0" />
              </div>
              <div className="space-y-1.5 text-center font-sans">
                <h3 className="font-black text-sm text-zinc-100 uppercase tracking-wider">Delete Circle?</h3>
                <p className="text-[11px] text-zinc-400 font-medium leading-relaxed">
                  Are you sure you want to permanently delete this circle? This action cannot be undone.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeleteCircleConfirmModal(false)}
                  className="bg-white/5 hover:bg-white/10 text-zinc-300 py-2.5 rounded-xl text-[10px] font-sans font-black tracking-wider uppercase transition border border-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const targetCircleUuid = freshCircle.dbUuid || dbCircle?.id || freshCircle.id;
                      await deleteCircle(targetCircleUuid);
                      setCircles?.((prev: any[]) => prev.filter(c => c.id !== freshCircle.id));
                      setSelectedCircle?.(null);
                      setShowDeleteCircleConfirmModal(false);
                      onBack();
                      triggerToast(`✓ Deleted circle ${freshCircle.name} permanently.`);
                    } catch (err: any) {
                      triggerToast(`Error: ${err.message || err}`);
                    }
                  }}
                  className="bg-[#E11D48] hover:bg-red-650 text-white font-sans font-black text-[10px] tracking-wider uppercase py-2.5 rounded-xl transition border border-red-500/10 cursor-pointer"
                >
                  Delete Circle
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULL-SCREEN PHOTO VIEWER MODAL */}
      <AnimatePresence>
        {showPhotoViewer && (
          <div className="fixed inset-0 z-[200] flex flex-col justify-between bg-black text-white">
            {/* Background Backdrop Fader */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPhotoViewer(false)}
              className="absolute inset-0 bg-black cursor-pointer"
            />

            {/* Header overlay */}
            <motion.div
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -30, opacity: 0 }}
              className="relative z-[220] px-5 py-4 flex items-center justify-between bg-black/60 backdrop-blur-md border-b border-white/[0.04] text-left"
            >
              <button
                type="button"
                onClick={() => setShowPhotoViewer(false)}
                className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] transition flex items-center justify-center text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider leading-tight truncate max-w-[180px]">
                  {freshCircle.name}
                </h4>
                <p className="text-[10px] text-zinc-450 font-medium tracking-wide mt-0.5">
                  {members.length} Members
                </p>
              </div>

              <button
                type="button"
                onClick={() => triggerToast("Edit Photo capability coming soon!")}
                className="w-9 h-9 rounded-full bg-white/[0.05] hover:bg-white/[0.12] transition flex items-center justify-center text-white cursor-pointer"
              >
                <Pencil className="w-4.5 h-4.5" />
              </button>
            </motion.div>

            {/* Central Image Viewer */}
            <div
              onClick={() => setShowPhotoViewer(false)}
              className="flex-1 flex items-center justify-center p-3 relative z-[210] cursor-pointer"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: "spring", damping: 26, stiffness: 220 }}
                className="max-w-full max-h-[75vh] rounded-2xl overflow-hidden shadow-2xl bg-zinc-950 flex items-center justify-center"
              >
                <img
                  src={freshCircle.groupPhoto || freshCircle.groupImage || freshCircle.cover_image || (freshCircle as any).group_photo}
                  alt={freshCircle.name}
                  className="max-w-full max-h-[75vh] object-contain select-none"
                  referrerPolicy="no-referrer"
                  onClick={(e) => e.stopPropagation()} // Prevent closing when tapping on the image itself
                />
              </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* CIRCLE SETTINGS PERMISSIONS SUB-SCREEN */}
      <AnimatePresence>
        {showPermissionsSubScreen && (
          <CirclePermissions
            show={showPermissionsSubScreen}
            onClose={() => setShowPermissionsSubScreen(false)}
            freshCircle={freshCircle}
            dbCircle={dbCircle}
            isAdmin={isAdmin}
            isHost={isHost}
            activeUserUuid={activeUserUuid}
            activeUserId={activeUserId}
            updateCircle={updateCircle}
            updateCircleMemberPreference={updateCircleMemberPreference}
            setCircles={setCircles}
            setSelectedCircle={setSelectedCircle}
            triggerToast={triggerToast}
            members={members}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
export default CircleDetailScreen;