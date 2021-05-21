const { createPool, sql } = require("slonik");

const run = async () => {
  const pool = createPool(
    "postgresql://avnadmin:l4cxwlkldhki6d64@public-mothership-contra.aivencloud.com:23893/contra?ssl=1"
  );
  const result = await pool.query(sql`
    select q from (
      select *
      from basic_opportunity_position_type b
            full outer join google_place_type g on false
            full outer join productized_service_fee_type p on false
  ) q
  `);
  console.log(result);
};

run().catch(console.log);
