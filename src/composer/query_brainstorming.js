let x = {
  query: {
    name: "featured_members",
    retType: "User",
    retCardinality: "many",
    from: ["recent_memberships", "user"],
    path: [
      {
        name: "recent_memberships",
        refKey: "Org.recent_memberships",
        retType: "OrgMembership",
        retCardinality: "many",
        alias: "rm0",
        bpAlias: "m",
        nullable: false,
        join: "inner",
        path: [],
        select: [
          {
            retType: "boolean",
            name: "is_active",
            refKey: "OrgMembership.is_active",
          },
        ],
      },
      {
        name: "user",
        refKey: "OrgMembership.user",
        retType: "User",
        retCardinality: "one",
        alias: "u1",
        bpAlias: "u",
        nullable: false,
        join: "inner",
        path: [
          {
            name: "profile",
            refKey: "User.profile",
            retType: "Profile",
            retCardinality: "one",
            join: "left",
            nullable: true,
            alias: "u1p0",
            bpAlias: null,
            select: [
              {
                retType: "boolean",
                name: "verified",
                refKey: "Profile.verified",
              },
            ],
          },
          {
            name: "org_count",
            refKey: "User.org_count",
            retType: "integer",
            join: "inner",
            nullable: false,
            alias: "u1oc0",
            bpAlias: null,
          },
          {
            name: "repo_count",
            refKey: "User.repo_count",
            retType: "integer",
            join: "inner",
            nullable: false,
            alias: "u1rc1",
            bpAlias: null,
          },
        ],
        select: [
          {
            retType: "boolean",
            name: "is_active",
            refKey: "User.is_active",
          },
          {
            retType: "integer",
            name: "org_count",
            refKey: "User.org_count",
          },
          {
            retType: "integer",
            name: "repo_count",
            refKey: "User.repo_count",
          },
        ],
      },
    ],
    filters: [
      { type: "boolean", lhs: "rm0.is_active", op: "=", rhs: true },
      { type: "boolean", lhs: "u1.is_active", op: "=", rhs: true },
      { type: "numeric", lhs: "u1.org_count", op: "=", rhs: 1 },
      { type: "numeric", lhs: "u1.repo_count", op: "=", rhs: "u1.org_count" },
      { type: "boolean", lhs: "u1p0.verified", op: "is", rhs: true },
      { type: "boolean", lhs: "u1p0.id", op: "is", rhs: null },
    ],
  },
};

/*
  Problem: should we filter on inner-most query, how does that affect OR IS NULL queries?
  Should everything be LEFT JOIN?
 */

/*
  query featured_members:
    from recent_memberships.user as m.u
    filter m.is_active is true
      and u.is_active is true
      and u.org_count is 1
      and u.repo_count is u.org_count
      and u.profile.verified is true
      or u.profile is null

// imamo listu orgova, dohvati gornje za svaku!
*/
/*

select { featured_members { id, posts {} } }

  SELECT u1.*

  FROM
  -- fetch `recent_memberships`
  
  ( SELECT om0.*
    FROM orgmembership om0
    WHERE created_at > now - '1 week'
  ) om0
  JOIN
    -- fetch `user`, including `org_count`, `repo_count`, and `profile_verified`
    (SELECT u0.*,
            oc1.org_count,
            rc3.repo_count,
            p4.verified as profile__verified,
            p4.id as profile__id
      FROM user u0
      JOIN (
        SELECT user_id, count(1) as org_count 
        FROM orgmembership om1
        GROUP BY user_id
      ) oc1
        ON u0.id = oc1.user_id
      JOIN (
        SELECT r0.owner_id, count(1) as repo_count
        FROM repo r0
        GROUP BY owner_id
      ) rc3
        ON u0.id = rc3.owner_id
      LEFT JOIN (
        SELECT p0.*
        FROM profile p0
      ) p4
        ON u0.id = p4.user_id
    ) u1 ON om0.user_id = u1.id
  -- apply filters
  WHERE
    om0.is_active = true
    AND u1.is_active = true
    AND u1.org_count = 1
    AND u1.repo_count = u1.org_count
    AND u1.profile__verified = true
        OR u1.profile__id IS NULL
    -- we are accesing this for a list of orgs
    AND om0.org_id IN [...]
*/

/*
-- INLINE FILTERI

todo

*/

/*

SELECT u.*, count(1) as org_count
FROM user u
JOIN org_memberships om
  ON om.user_id = u.id
GROUP BY u.*

*/

/*

I'm in memberships, let's join user stuff

  -- SELECT u0.*, oc1.org_count, rc3.repo_count
  -- FROM user u0
  JOIN (
    SELECT user_id, count(1) as org_count
    FROM orgmembership om1
    GROUP BY user_id
  ) oc1
    ON oc1.user_id = u0.id
  JOIN (
    SELECT owner_id, count(1) as repo_count
    FROM repo r2
    GROUP BY owner_id
  ) rc3
    ON rc3.owner_id = u0.id



 */
