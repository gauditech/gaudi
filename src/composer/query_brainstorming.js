let x = {
  query: {
    name: "featured_members",
    retType: "User",
    retCardinality: "many",
    from: ["recent_memberships", "user"],
    filters: "...",
    resolved: {
      path: [
        {
          name: "recent_memberships",
          refKey: "Org.recent_memberships",
          retType: "OrgMembership",
          retCardinality: "many",
          alias: "rm0",
          bpAlias: "m",
          nullable: false,
          path: [],
          filters: [{ type: "boolean", lhs: "rm0.is_active", op: "=", rhs: "true" }],
          collect: [
            {
              type: "field",
              retType: "boolean",
              name: "is_active",
              refKey: "OrgMembership.is_active",
            },
          ],
          select: null,
        },
        {
          name: "user",
          refKey: "OrgMembership.user",
          retType: "User",
          retCardinality: "one",
          alias: "u1",
          bpAlias: "u",
          nullable: false,
          path: [
            {
              name: "profile",
              refKey: "User.profile",
              retType: "Profile",
              retCardinality: "one",
              alias: "u1p0",
              bpAlias: null,
              nullable: false,
              filters: [{ type: "boolean", lhs: "u1p0.verified", op: "is", rhs: "true" }],
            },
          ],
          collect: [
            {
              type: "field",
              retType: "boolean",
              name: "is_active",
              refKey: "User.is_active",
              collect: null,
            },
            {
              type: "query",
              retType: "integer",
              name: "org_count",
              refKey: "User.org_count",
              collect: null,
            },
          ],
          filters: [
            { type: "boolean", lhs: "u1.is_active", op: "=", rhs: "true" },
            { type: "numeric", lhs: "u1.org_count", op: "=", rhs: "1" },
          ],
          select: null,
        },
      ],
      filters: [],
    },
  },
};

/*
  Problem: should we filter on inner-most query, how does that affect OR IS NULL queries?
  Should everything be LEFT JOIN?
 */

/*
// from recent_memberships.user as m.u
// filter m.is_active is true
// and u.is_active is true
// and u.org_count is 1
// and u.profile.verified is true

// imamo listu orgova, dohvati gornje za svaku!
*/
/*
  SELECT u1.*

  FROM
  -- fetch `recent_memberships`
  
  ( SELECT *
    FROM orgmembership om0
    WHERE created_at > now - '1 week' -- recent check
  ) om0
  JOIN
    -- fetch `user`, bundle `org_count`
    (SELECT u1.* count(1) as org_count, 
      FROM user u1
      JOIN orgmembership as om2
        ON om2.user_id = u1.id
      GROUP BY u1
    ) u1
    ON u1.id = om0.user_id
  -- apply filters
  WHERE
    om0.is_active = true
    AND u1.is_active = true
    AND u1.orgcount = 1
    -- we are accesing this for a list of orgs
    AND om0.org_id IN [...]
*/

/*

SELECT u.*, count(1) as org_count
FROM user u
JOIN org_memberships om
  ON om.user_id = u.id
GROUP BY u.*

*/
