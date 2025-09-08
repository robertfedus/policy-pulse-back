import * as insurance_companiesService from '../services/insurance_companies.service.js';
import asyncHandler from '../utils/asyncHandler.js';


export const createInsuranceCompanies = asyncHandler(async (req, res) => {
  const created = await insurance_companiesService.createInsuranceCompanies(req.body);
  res.status(201).json({ data: created });
});


export const listInsuranceCompanies = asyncHandler(async (req, res) => {
  // Empty example — returns zero items by default
  const companies = await insurance_companiesService.listInsuranceCompanies();
  res.json({ data: companies });
});

export const getInsuranceCompanyById = asyncHandler(async (req, res) => {   
  const company = await insurance_companiesService.getInsuranceCompanyById(req.params.id);
  res.json({ data: company });
});

export const updateInsuranceCompany = asyncHandler(async (req, res) => {
  const updated = await insurance_companiesService.updateInsuranceCompany(req.params.id, req.body);
  res.json({ data: updated });
});