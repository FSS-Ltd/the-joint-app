-- INSERT RETURNING must validate the newly inserted row directly; a STABLE
-- helper lookup cannot see that row in its command snapshot.
ALTER POLICY scope_read ON app."BudgetScope" USING (
 (NOT ready AND app.scope_is_valid()
  AND "householdId" = nullif(current_setting('joint.household_id',true),'')::uuid
  AND "creatorMembershipId" = nullif(current_setting('joint.membership_id',true),'')::uuid)
 OR (ready AND app.budget_scope_access(id))
);
