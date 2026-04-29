const express        = require('express');
const router         = express.Router();
const { buildForecast } = require('../services/forecast');

router.post('/site', (req, res, next) => {
  try {
    const {
      currentCost    = 200000,
      score          = 70,
      growthRate     = 0.065,
      horizonYears   = 5,
      supplyDemandN  = 0.6,
      competitionN   = 0.4
    } = req.body;

    const forecast = buildForecast({ currentCost, score, growthRate, horizonYears, supplyDemandN, competitionN });
    res.json({ success: true, forecast });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
