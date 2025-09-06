// TODO overall sudah oke, bisa di improve cuma udah oke
const Industry = require("../../schema/industrySchema");
const Skill = require("../../schema/skillSchema");
const Provinsi = require("../../schema/provinsiSchema");
const Kabupaten = require("../../schema/kabupatenSchema");
const Kecamatan = require("../../schema/kecamatanSchema");
const Kelurahan = require("../../schema/kelurahanSchema");
const University = require("../../schema/universitySchema");
const StudyProgram = require("../../schema/studyProgramSchema");

const {
  industryDto,
  skillDto,
  provinsiDto,
  kabupatenDto,
  kecamatanDto,
  kelurahanDto,
} = require("./dto");
const { default: axios } = require("axios");
const { roleAuth } = require("../../helper/roleAuth");
const Company = require("../../schema/companySchema");
const User = require("../../schema/userSchema");
const Review = require("../../schema/reviewSchema");
const {
  normalizeName,
  escapeRegex,
  buildFuzzyQueryOnNormName,
} = require("../../helper/normalizeHelper");
const { default: mongoose } = require("mongoose");

function toBool(v) {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}

function getPaging(req) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "20", 10), 1),
    100
  );
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function regexOrNull(q) {
  if (!q) return null;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i");
}

async function adminRoutes(fastify, options) {
  fastify.post(
    "/study-program",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const name = (req.body.name || "").trim();
      if (!name) return res.code(400).send({ message: "Name is required" });
      const normName = normalizeName(name);

      const dup = await StudyProgram.findOne({ normName }).lean();
      if (dup)
        return res.code(409).send({ message: "Study program already exists" });

      const program = await new StudyProgram({ name, normName }).save();
      res.code(201).send(program);
    }
  );

  fastify.get("/study-program", async (req, res) => {
    const q = (req.query.q || "").trim();
    const filter = q ? buildFuzzyQueryOnNormName(q) : {};
    const list = await StudyProgram.find(filter).sort({ normName: 1 }).lean();
    res.send(list);
  });

  fastify.get("/study-program/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    const filter = q ? buildFuzzyQueryOnNormName(q) : {};
    const list = await StudyProgram.find(filter)
      .sort({ normName: 1 })
      .limit(50)
      .lean();
    res.send(list);
  });

  fastify.put(
    "/study-program/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const name = (req.body.name || "").trim();
      if (!name) return res.code(400).send({ message: "Name is required" });
      const normName = normalizeName(name);

      const clash = await StudyProgram.findOne({
        _id: { $ne: req.params.id },
        normName,
      }).lean();
      if (clash)
        return res
          .code(409)
          .send({ message: "Another study program with this name exists" });

      const updated = await StudyProgram.findByIdAndUpdate(
        req.params.id,
        { name, normName },
        { new: true }
      );
      if (!updated) return res.code(404).send({ message: "Not found" });
      res.send(updated);
    }
  );

  fastify.delete(
    "/study-program/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await StudyProgram.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  // UNIVERSITY
  fastify.post(
    "/university",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const name = (req.body.name || "").trim();
      const speciality = Array.isArray(req.body.speciality)
        ? req.body.speciality
        : [];
      if (!name)
        return res.code(400).send({ message: "University name is required" });

      const normName = normalizeName(name);
      const dup = await University.findOne({ normName }).lean();
      if (dup)
        return res.code(409).send({ message: "University already exists" });

      const university = await University.create({
        name,
        normName,
        speciality,
      });
      await university.populate("speciality", "name");
      res.code(201).send(university);
    }
  );

  fastify.get("/university", async (req, res) => {
    const q = (req.query.q || "").trim();
    const filter = q ? buildFuzzyQueryOnNormName(q) : {};
    const universities = await University.find(filter)
      .sort({ normName: 1 })
      .populate("speciality", "name")
      .lean();
    res.send(universities);
  });

  fastify.get("/university/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    const filter = q ? buildFuzzyQueryOnNormName(q) : {};
    const universities = await University.find(filter)
      .sort({ normName: 1 })
      .limit(50)
      .populate("speciality", "name")
      .lean();
    res.send(universities);
  });

  fastify.put(
    "/university/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const update = {};
      if (typeof req.body.name === "string") {
        const name = req.body.name.trim();
        if (!name)
          return res.code(400).send({ message: "Name cannot be empty" });
        update.name = name;
        update.normName = normalizeName(name);

        const clash = await University.findOne({
          _id: { $ne: req.params.id },
          normName: update.normName,
        }).lean();
        if (clash)
          return res
            .code(409)
            .send({ message: "Another university with this name exists" });
      }
      if (Array.isArray(req.body.speciality)) {
        update.speciality = req.body.speciality;
      }

      const updated = await University.findByIdAndUpdate(
        req.params.id,
        update,
        { new: true }
      )
        .populate("speciality", "name")
        .lean();
      if (!updated)
        return res.code(404).send({ message: "University not found" });
      res.send(updated);
    }
  );

  fastify.delete(
    "/university/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await University.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  // INDUSTRY
  fastify.post(
    "/industry",
    { preHandler: roleAuth(["admin"]), schema: industryDto },
    async (req, res) => {
      const name = (req.body.name || "").trim();
      if (!name) return res.code(400).send({ message: "Name is required" });
      const normName = normalizeName(name);

      const dup = await Industry.findOne({ normName }).lean();
      if (dup)
        return res.code(409).send({ message: "Industry already exists" });

      const industry = await new Industry({ name, normName }).save();
      res.code(201).send(industry);
    }
  );

  fastify.put(
    "/industry/:id",
    { preHandler: roleAuth(["admin"]), schema: industryDto },
    async (req, res) => {
      const name = (req.body.name || "").trim();
      if (!name) return res.code(400).send({ message: "Name is required" });
      const normName = normalizeName(name);

      const clash = await Industry.findOne({
        _id: { $ne: req.params.id },
        normName,
      }).lean();
      if (clash)
        return res
          .code(409)
          .send({ message: "Another industry with this name exists" });

      const updated = await Industry.findByIdAndUpdate(
        req.params.id,
        { name, normName },
        { new: true }
      );
      if (!updated) return res.code(404).send({ message: "Not found" });
      res.send(updated);
    }
  );

  fastify.delete(
    "/industry/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Industry.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get("/industry", async (req, res) => {
    const q = (req.query.q || "").trim();
    const filter = q ? buildFuzzyQueryOnNormName(q) : {};
    const data = await Industry.find(filter).sort({ normName: 1 }).lean();
    res.send(data);
  });

  fastify.get("/industry/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    const filter = q ? buildFuzzyQueryOnNormName(q) : {};
    const industries = await Industry.find(filter)
      .sort({ normName: 1 })
      .limit(50)
      .lean();
    res.send(industries);
  });

  // SKILL
  fastify.post(
    "/skill",
    { preHandler: roleAuth(["admin"]) /*, schema: skillDto*/ },
    async (req, res) => {
      const raw = (req.body?.name || "").trim();
      if (!raw) return res.code(400).send({ message: "name is required" });

      const normName = normalizeName(raw);

      try {
        const skill = await Skill.create({
          name: raw,
          normName,
          source: "admin",
        });
        return res.code(201).send(skill);
      } catch (e) {
        if (e?.code === 11000) {
          const existing = await Skill.findOne({ normName }).lean();
          return res.code(409).send({
            message: "Skill already exists",
            skill: existing,
          });
        }
        throw e;
      }
    }
  );

  fastify.put(
    "/skill/:id",
    { preHandler: roleAuth(["admin"]) /*, schema: skillDto*/ },
    async (req, res) => {
      const raw = (req.body?.name || "").trim();
      if (!raw) return res.code(400).send({ message: "name is required" });

      const normName = normalizeName(raw);

      try {
        const updated = await Skill.findByIdAndUpdate(
          req.params.id,
          { name: raw, normName },
          { new: true, runValidators: true }
        );
        if (!updated) return res.code(404).send({ message: "Skill not found" });
        return res.send(updated);
      } catch (e) {
        if (e?.code === 11000) {
          const conflict = await Skill.findOne({ normName }).lean();
          return res.code(409).send({
            message: "Another skill with the same name already exists",
            conflictWith: conflict?._id,
          });
        }
        throw e;
      }
    }
  );

  // DELETE a skill and remove it from every user's skills array
  fastify.delete(
    "/skill/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const { id } = req.params;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.code(400).send({ message: "Invalid skill id" });
      }

      try {
        const skill = await Skill.findById(id).lean();
        if (!skill) return res.code(404).send({ message: "Skill not found" });

        // Pull this skill from all users
        const pullRes = await User.updateMany(
          { skills: id },
          { $pull: { skills: id } }
        );

        await Skill.deleteOne({ _id: id });

        return res.send({
          ok: true,
          removedSkill: id,
          usersUpdated: pullRes.modifiedCount ?? pullRes.nModified ?? 0,
        });
      } catch (err) {
        req.log?.error(err);
        return res.code(500).send({ message: "Failed to delete skill" });
      }
    }
  );

  fastify.get("/skill", async (req, res) => {
    const sort = (req.query.sort || "popular").toString(); // "popular" | "name"
    const order = (req.query.order || "desc").toString(); // "asc" | "desc"
    const limit = Math.min(parseInt(req.query.limit || 0, 10) || 0, 1000); // optional

    let sortObj;
    if (sort === "name") {
      sortObj = { name: order === "asc" ? 1 : -1 };
    } else {
      // popular default
      sortObj = { usageCount: order === "asc" ? 1 : -1, name: 1 };
    }

    const query = Skill.find({}).sort(sortObj);
    if (limit > 0) query.limit(limit);

    const data = await query.lean();
    return res.send(data);
  });

  // SEARCH (prefix; popularity first; limit 10 default)
  fastify.get("/skill/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit || 10, 10) || 10, 25);

    if (!q) {
      const top = await Skill.find({})
        .sort({ usageCount: -1, name: 1 })
        .limit(limit)
        .lean();
      return res.send(top);
    }

    const norm = normalizeName(q);
    const esc = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("^" + esc, "i");

    const skills = await Skill.find({
      $or: [{ name: re }, { normName: re }],
    })
      .sort({ usageCount: -1, name: 1 })
      .limit(limit)
      .lean();

    return res.send(skills);
  });

  // PROVINSI
  fastify.post(
    "/provinsi",
    { preHandler: roleAuth(["admin"]), schema: provinsiDto },
    async (req, res) => {
      const prov = await new Provinsi({ name: req.body.name }).save();
      res.code(201).send(prov);
    }
  );

  fastify.put(
    "/provinsi/:id",
    { preHandler: roleAuth(["admin"]), schema: provinsiDto },
    async (req, res) => {
      const updated = await Provinsi.findByIdAndUpdate(
        req.params.id,
        { name: req.body.name },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.delete(
    "/provinsi/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Provinsi.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get("/provinsi", async (req, res) => {
    const data = await Provinsi.find();
    res.send(data);
  });

  // KABUPATEN
  fastify.post(
    "/kabupaten",
    { preHandler: roleAuth(["admin"]), schema: kabupatenDto },
    async (req, res) => {
      const kab = await new Kabupaten({
        name: req.body.name,
        provinsi: req.body.provinsi,
      }).save();
      res.code(201).send(kab);
    }
  );

  fastify.put(
    "/kabupaten/:id",
    { preHandler: roleAuth(["admin"]), schema: kabupatenDto },
    async (req, res) => {
      const updated = await Kabupaten.findByIdAndUpdate(
        req.params.id,
        {
          name: req.body.name,
          provinsi: req.body.provinsi,
        },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.delete(
    "/kabupaten/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Kabupaten.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get("/kabupaten", async (req, res) => {
    const filter = req.query.provinsi ? { provinsi: req.query.provinsi } : {};
    const data = await Kabupaten.find(filter).populate("provinsi");
    res.send(data);
  });

  // KECAMATAN
  fastify.post(
    "/kecamatan",
    { preHandler: roleAuth(["admin"]), schema: kecamatanDto },
    async (req, res) => {
      const kec = await new Kecamatan({
        name: req.body.name,
        kabupaten: req.body.kabupaten,
      }).save();
      res.code(201).send(kec);
    }
  );

  fastify.put(
    "/kecamatan/:id",
    { preHandler: roleAuth(["admin"]), schema: kecamatanDto },
    async (req, res) => {
      const updated = await Kecamatan.findByIdAndUpdate(
        req.params.id,
        {
          name: req.body.name,
          kabupaten: req.body.kabupaten,
        },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.get("/kecamatan", async (req, res) => {
    const filter = req.query.kabupaten
      ? { kabupaten: req.query.kabupaten }
      : {};
    const data = await Kecamatan.find(filter).populate("kabupaten");
    res.send(data);
  });

  fastify.delete(
    "/kecamatan/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Kecamatan.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get(
    "/sync-location/new",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      res.sse({
        event: "start",
        data: JSON.stringify({ message: "Starting location sync…" }),
      });

      const send = (event, payload) =>
        res.sse({ event, data: JSON.stringify(payload) });

      try {
        const provinsiRes = await axios.get(
          "https://ibnux.github.io/data-indonesia/provinsi.json"
        );
        const provinsiList = provinsiRes.data || [];

        const added = { provinsi: 0, kabupaten: 0, kecamatan: 0 };
        const totals = {
          provinsi: provinsiList.length,
          kabupaten: 0,
          kecamatan: 0,
        };
        const done = { provinsi: 0, kabupaten: 0, kecamatan: 0 };

        send("totals", { totals });

        for (const prov of provinsiList) {
          send("status", { level: "provinsi", name: prov.nama });

          let provDoc = await Provinsi.findOne({ name: prov.nama });
          if (!provDoc) {
            try {
              provDoc = await Provinsi.create({ name: prov.nama });
              added.provinsi++;
            } catch {}
          }
          done.provinsi++;
          send("progress", { done, totals, added });

          const kabRes = await axios.get(
            `https://ibnux.github.io/data-indonesia/kabupaten/${prov.id}.json`
          );
          const kabList = kabRes.data || [];
          totals.kabupaten += kabList.length;
          send("totals", { totals });

          for (const kab of kabList) {
            send("status", { level: "kabupaten", name: kab.nama });

            let kabDoc = await Kabupaten.findOne({ name: kab.nama });
            if (!kabDoc) {
              try {
                kabDoc = await Kabupaten.create({
                  name: kab.nama,
                  provinsi: provDoc._id,
                });
                added.kabupaten++;
              } catch {}
            }
            done.kabupaten++;
            send("progress", { done, totals, added });

            const kecRes = await axios.get(
              `https://ibnux.github.io/data-indonesia/kecamatan/${kab.id}.json`
            );
            const kecList = kecRes.data || [];
            totals.kecamatan += kecList.length;
            send("totals", { totals });

            for (const kec of kecList) {
              send("status", { level: "kecamatan", name: kec.nama });

              let kecDoc = await Kecamatan.findOne({ name: kec.nama });
              if (!kecDoc) {
                try {
                  await Kecamatan.create({
                    name: kec.nama,
                    kabupaten: kabDoc._id,
                  });
                  added.kecamatan++;
                } catch {}
              }
              done.kecamatan++;
              send("progress", { done, totals, added });
            }
          }
        }

        send("done", { message: "Sync complete", added, totals, done });
        res.sseContext.source.end();
      } catch (err) {
        send("error", { message: err.message || "Sync failed" });
        res.sseContext.source.end();
      }
    }
  );

  fastify.get(
    "/users",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const { page, limit, skip } = getPaging(req);
      const q = (req.query.q || "").trim();
      const isActive = toBool(req.query.isActive);
      const isVerified = toBool(req.query.isVerified);

      const $and = [{ role: "user" }];
      if (q) {
        const r = regexOrNull(q);
        $and.push({ $or: [{ fullName: r }, { email: r }] });
      }
      if (isActive !== undefined) $and.push({ isActive });
      if (isVerified !== undefined) $and.push({ isVerified });

      const filter = $and.length ? { $and } : {};
      const [items, total] = await Promise.all([
        User.find(filter)
          .select("fullName email isVerified isActive createdAt")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        User.countDocuments(filter),
      ]);

      res.send({ items, total, page, pages: Math.ceil(total / limit) });
    }
  );

  fastify.patch(
    "/users/:id/activate",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const doc = await User.findByIdAndUpdate(
        req.params.id,
        { isActive: true },
        { new: true }
      ).select("fullName email isActive");
      if (!doc) return res.code(404).send({ message: "User not found" });
      res.send({ ok: true, user: doc });
    }
  );

  fastify.patch(
    "/users/:id/deactivate",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const doc = await User.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      ).select("fullName email isActive");
      if (!doc) return res.code(404).send({ message: "User not found" });
      res.send({ ok: true, user: doc });
    }
  );

  fastify.delete(
    "/users/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const doc = await User.findByIdAndDelete(req.params.id);
      if (!doc) return res.code(404).send({ message: "User not found" });
      res.send({ ok: true });
    }
  );

  // ---------- COMPANIES ----------
fastify.get(
  "/companies",
  { preHandler: roleAuth(["admin"]) },
  async (req, res) => {
    const { page, limit, skip } = getPaging(req);
    const q = (req.query.q || "").trim();
    const isActive = toBool(req.query.isActive);
    const isVerified = toBool(req.query.isVerified); // email verification filter (kept)
    const trusted = toBool(req.query.trusted);       // NEW: trust.verified filter

    const $and = [{ role: "company" }];
    if (q) {
      const r = regexOrNull(q);
      $and.push({ $or: [{ companyName: r }, { email: r }] });
    }
    if (isActive !== undefined)   $and.push({ isActive });
    if (isVerified !== undefined) $and.push({ isVerified });
    if (trusted !== undefined)    $and.push({ "trust.verified": trusted });

    const filter = $and.length ? { $and } : {};
    const [items, total] = await Promise.all([
      Company.find(filter)
        .select(
          "companyName email isVerified isActive createdAt rating.average rating.count trust.verified trust.by trust.at trust.notes"
        )
        .populate({ path: "trust.by", select: "email fullName" }) // uncomment if you want admin details
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Company.countDocuments(filter),
    ]);

    res.send({ items, total, page, pages: Math.ceil(total / limit) });
  }
);


fastify.patch(
  "/companies/:id/verify",
  { preHandler: roleAuth(["admin"]) },
  async (req, res) => {
    const notes = (req.body?.notes || "").toString().slice(0, 500);
    const doc = await Company.findByIdAndUpdate(
      req.params.id,
      {
        "trust.verified": true,
        "trust.by": req.userId,
        "trust.at": new Date(),
        "trust.notes": notes,
      },
      { new: true }
    ).select("companyName email trust");
    if (!doc) return res.code(404).send({ message: "Company not found" });
    res.send({ ok: true, company: doc });
  }
);

fastify.patch(
  "/companies/:id/unverify",
  { preHandler: roleAuth(["admin"]) },
  async (req, res) => {
    const doc = await Company.findByIdAndUpdate(
      req.params.id,
      {
        "trust.verified": false,
        "trust.by": null,
        "trust.at": null,
        "trust.notes": "",
      },
      { new: true }
    ).select("companyName email trust");
    if (!doc) return res.code(404).send({ message: "Company not found" });
    res.send({ ok: true, company: doc });
  }
);


  fastify.patch(
    "/companies/:id/activate",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const doc = await Company.findByIdAndUpdate(
        req.params.id,
        { isActive: true },
        { new: true }
      ).select("companyName email isActive");
      if (!doc) return res.code(404).send({ message: "Company not found" });
      res.send({ ok: true, company: doc });
    }
  );

  fastify.patch(
    "/companies/:id/deactivate",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const doc = await Company.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true }
      ).select("companyName email isActive");
      if (!doc) return res.code(404).send({ message: "Company not found" });
      res.send({ ok: true, company: doc });
    }
  );

  fastify.delete(
    "/companies/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const doc = await Company.findByIdAndDelete(req.params.id);
      if (!doc) return res.code(404).send({ message: "Company not found" });
      res.send({ ok: true });
    }
  );

  // ---------- REVIEWS ----------
  fastify.get(
    "/reviews",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const skip = (page - 1) * limit;

      const minRating = parseInt(req.query.minRating || "0", 10);
      const q = (req.query.q || "").trim();

      const USERS = User.collection.name;       // e.g. "users"
      const COMPANIES = Company.collection.name; // e.g. "companies"

      const baseMatch = {};
      if (minRating > 0) baseMatch.rating = { $gte: minRating };

      const regex = q ? new RegExp(escapeRegex(q), "i") : null;

      const pipeline = [
        { $match: baseMatch },

        // Look up both possible collections for reviewer
        { $lookup: { from: USERS, localField: "reviewer", foreignField: "_id", as: "rUser" } },
        { $lookup: { from: COMPANIES, localField: "reviewer", foreignField: "_id", as: "rCompany" } },

        // Look up both possible collections for reviewee
        { $lookup: { from: USERS, localField: "reviewee", foreignField: "_id", as: "eUser" } },
        { $lookup: { from: COMPANIES, localField: "reviewee", foreignField: "_id", as: "eCompany" } },

        // Flatten lookups
        {
          $addFields: {
            rUser: { $arrayElemAt: ["$rUser", 0] },
            rCompany: { $arrayElemAt: ["$rCompany", 0] },
            eUser: { $arrayElemAt: ["$eUser", 0] },
            eCompany: { $arrayElemAt: ["$eCompany", 0] },
          },
        },

        // Choose the right doc based on refPath types
        {
          $addFields: {
            reviewerDoc: {
              $cond: [{ $eq: ["$reviewerType", "User"] }, "$rUser", "$rCompany"],
            },
            revieweeDoc: {
              $cond: [{ $eq: ["$revieweeType", "User"] }, "$eUser", "$eCompany"],
            },
          },
        },

        // Compute names/emails for searching and UI
        {
          $addFields: {
            reviewerName: {
              $cond: [
                { $eq: ["$reviewerType", "User"] },
                "$reviewerDoc.fullName",
                "$reviewerDoc.companyName",
              ],
            },
            reviewerEmail: "$reviewerDoc.email",
            revieweeName: {
              $cond: [
                { $eq: ["$revieweeType", "User"] },
                "$revieweeDoc.fullName",
                "$revieweeDoc.companyName",
              ],
            },
            revieweeEmail: "$revieweeDoc.email",
          },
        },
      ];

      if (regex) {
        pipeline.push({
          $match: {
            $or: [
              { comment: regex },
              { reviewerName: regex },
              { reviewerEmail: regex },
              { revieweeName: regex },
              { revieweeEmail: regex },
            ],
          },
        });
      }

      pipeline.push(
        { $sort: { createdAt: -1, _id: -1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  _id: 1,
                  rating: 1,
                  comment: { $ifNull: ["$comment", ""] },
                  createdAt: 1,
                  application: 1, // keep raw ObjectId; populate if you need more
                  reviewer: {
                    _id: "$reviewer",
                    type: "$reviewerType",
                    name: { $ifNull: ["$reviewerName", "[deleted]"] },
                    email: { $ifNull: ["$reviewerEmail", null] },
                  },
                  reviewee: {
                    _id: "$reviewee",
                    type: "$revieweeType",
                    name: { $ifNull: ["$revieweeName", "[deleted]"] },
                    email: { $ifNull: ["$revieweeEmail", null] },
                  },
                },
              },
            ],
            total: [{ $count: "n" }],
          },
        }
      );

      const agg = await Review.aggregate(pipeline);

      const items = agg?.[0]?.items || [];
      const total = agg?.[0]?.total?.[0]?.n || 0;
      return res.send({
        items,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    }
  );

  fastify.delete(
    "/reviews/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const doc = await Review.findByIdAndDelete(req.params.id);
      if (!doc) return res.code(404).send({ message: "Review not found" });
      res.send({ ok: true });
    }
  );
}

module.exports = adminRoutes;
