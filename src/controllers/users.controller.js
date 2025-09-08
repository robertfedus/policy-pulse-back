import * as usersService from '../services/users.service.js';
import asyncHandler from '../utils/asyncHandler.js';

export const listUsers = asyncHandler(async (req, res) => {
  // Empty example — returns zero items by default
  const users = await usersService.listUsers();
  res.json({ data: users });
});

export const createUser = asyncHandler(async (req, res) => {
  const created = await usersService.createUser(req.body);
  res.status(201).json({ data: created });
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.params.id);
  res.json({ data: user });
});

export const findPatientsByHospital = asyncHandler(async (req, res) => {
  const patients = await usersService.findPatientsByHospital(req.params.id);
  res.json({ data: patients });
});

export const updateUser = asyncHandler(async (req, res) => {
  const updated = await usersService.updateUser(req.params.id, req.body);
  res.json({ data: updated });
});

export const deleteUser = asyncHandler(async (req, res) => {
  await usersService.deleteUser(req.params.id);
  res.status(204).send();
});

export const getAllPatients = asyncHandler(async (req, res) => {
  const patients = await usersService.getAllPatients();
  res.json({ data: patients });
});