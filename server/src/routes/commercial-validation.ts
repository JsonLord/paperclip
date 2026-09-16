import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { commercialValidationService } from "../services/commercial-validation.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
export function commercialValidationRoutes(db:Db){const router=Router(),service=commercialValidationService(db);
router.post("/companies/:companyId/commercial-validation/activate",async(req,res)=>{assertBoard(req);const companyId=req.params.companyId as string;assertCompanyAccess(req,companyId);try{res.status(201).json(await service.activate({...req.body,companyId}))}catch(error){res.status(422).json({error:error instanceof Error?error.message:"Activation failed"})}});
router.post("/companies/:companyId/sales/prospects",async(req,res)=>{const companyId=req.params.companyId as string;assertCompanyAccess(req,companyId);try{res.status(201).json(await service.ingestProspect(companyId,req.body))}catch(error){res.status(422).json({error:error instanceof Error?error.message:"Prospect invalid"})}});
router.post("/companies/:companyId/sales/prospects/:prospectId/interactions",async(req,res)=>{const companyId=req.params.companyId as string;assertCompanyAccess(req,companyId);try{res.status(201).json(await service.ingestInteraction(companyId,req.params.prospectId as string,{...req.body,occurredAt:new Date(req.body.occurredAt)}))}catch(error){res.status(422).json({error:error instanceof Error?error.message:"Interaction invalid"})}});
router.post("/companies/:companyId/sales/commitments",async(req,res)=>{const companyId=req.params.companyId as string;assertCompanyAccess(req,companyId);try{res.status(201).json(await service.recordCommitment(companyId,req.body))}catch(error){res.status(422).json({error:error instanceof Error?error.message:"Commitment invalid"})}});
router.post("/companies/:companyId/sales/issues/:issueId/wait",async(req,res)=>{const companyId=req.params.companyId as string;assertCompanyAccess(req,companyId);res.status(201).json(await service.wait(companyId,req.params.issueId as string,req.body.reason))});
return router;}
