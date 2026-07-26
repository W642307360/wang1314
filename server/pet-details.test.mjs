import assert from "node:assert/strict";
import test from "node:test";
import { enrichPetDetails, normalizePetBirthDate } from "./pet-details.mjs";

test("商品详情文字可精确补全身份证和商品档案字段", () => {
  const result = enrichPetDetails({
    description:
      "性别：妹妹；出生日期：2026年4月18日；毛色：海豹双色；体型：小型；毛发长度：中长毛；性格：温顺亲人；疫苗记录：基础免疫已完成",
  });
  assert.equal(result.gender, "母");
  assert.equal(result.birth_date, "2026-04-18");
  assert.equal(result.color, "海豹双色");
  assert.equal(result.body_type, "小型");
  assert.equal(result.fur_length, "中长毛");
  assert.equal(result.personality, "温顺亲人");
  assert.equal(result.vaccine_record, "基础免疫已完成");
  assert.equal(result.detail_sources.birth_date, "description");
});

test("结构化字段优先于详情文字且缺失体型健康使用明确默认", () => {
  const result = enrichPetDetails({
    gender: "male",
    birth_date: "2026-05-09",
    color: "蓝白",
    description: "性别：母；出生日期：2026-01-01；毛色：金色",
  });
  assert.equal(result.gender, "公");
  assert.equal(result.birth_date, "2026-05-09");
  assert.equal(result.color, "蓝白");
  assert.equal(result.body_type, "中型");
  assert.equal(result.health_status, "健康");
});

test("飞书日期时间戳和中文日期统一为数据库日期", () => {
  assert.equal(normalizePetBirthDate("2026年7月2日"), "2026-07-02");
  assert.equal(normalizePetBirthDate(String(Date.UTC(2026, 6, 2))), "2026-07-02");
});
