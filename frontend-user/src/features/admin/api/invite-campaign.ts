import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InviteCampaign } from "@/shared/api/invite-campaign";
import { INVITE_CAMPAIGN_QUERY_KEY } from "@/shared/api/invite-campaign";
import { http, toApiError } from "@/shared/lib/http";

export const ADMIN_INVITE_CAMPAIGN_QUERY_KEY = [
  "admin",
  "invite-campaign",
] as const;

export function useAdminInviteCampaign() {
  return useQuery({
    queryKey: ADMIN_INVITE_CAMPAIGN_QUERY_KEY,
    queryFn: async () =>
      (await http.get<{ data: InviteCampaign }>("/admin/invites/campaign")).data
        .data,
  });
}

export function useUpdateAdminInviteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: InviteCampaign) => {
      try {
        return (
          await http.put<{ data: InviteCampaign }>(
            "/admin/invites/campaign",
            config,
          )
        ).data.data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: (config) => {
      qc.setQueryData(ADMIN_INVITE_CAMPAIGN_QUERY_KEY, config);
      void qc.invalidateQueries({ queryKey: INVITE_CAMPAIGN_QUERY_KEY });
      void qc.invalidateQueries({ queryKey: ["admin", "invites"] });
    },
  });
}
