export const views = {
  Comment: {
    name: "Comment",
    query: `
      SELECT
        id,
        body,
        post_id,
        person_id
      FROM comment
    `,
    columns: {
      id: {
        kind: "integer",
      } as const,
      body: {
        kind: "text",
      } as const,
      post_id: {
        kind: "integer",
      } as const,
      person_id: {
        kind: "integer",
      } as const,
    },
    type: {} as {
      id: number;
      body: string;
      post_id: number;
      person_id: number;
    },
  },
  Person: {
    name: "Person",
    query: `
      SELECT
        id,
        full_name
      FROM person
    `,
    columns: {
      id: {
        kind: "integer",
      } as const,
      full_name: {
        kind: "text",
      } as const,
    },
    type: {} as { id: number; full_name: string },
  },
  Post: {
    name: "Post",
    query: `
      SELECT
        id,
        body,
        person_id
      FROM post
    `,
    columns: {
      id: {
        kind: "integer",
      } as const,
      body: {
        kind: "text",
      } as const,
      person_id: {
        kind: "integer",
      } as const,
    },
    type: {} as { id: number; body: string; person_id: number },
  },
  PostLike: {
    name: "PostLike",
    query: `
      SELECT
        id,
        liked_at,
        post_id,
        person_id
      FROM post_like
    `,
    columns: {
      id: {
        kind: "integer",
      } as const,
      liked_at: {
        kind: "timestamp with time zone",
      } as const,
      post_id: {
        kind: "integer",
      } as const,
      person_id: {
        kind: "integer",
      } as const,
    },
    type: {} as {
      id: number;
      liked_at: string;
      post_id: number;
      person_id: number;
    },
  },
};
