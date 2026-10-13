import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function listVenues(_req: Request, res: Response) {
    const venues = await prisma.venue.findMany();
    return res.json(venues);
}
export async function getVenueById(req: Request, res: Response) {
    const { id } = req.params;
    const venue = await prisma.venue.findUnique({
        where: { venue_id: id }
    });
    if(!venue) {
        return res.status(404).json({ error: "Venue not found" });
    }
    return res.json(venue);
}
export async function createVenue(req: Request, res: Response) {
    const { name, address,city,capacity } = req.body;
    const venue = await prisma.venue.create({
        data: { name, address, city, capacity }
    });
    return res.status(201).json(venue);
}
export async function updateVenue(req: Request, res: Response) {
    const { id } = req.params;
    const existing = await prisma.venue.findUnique({ where: { venue_id: id } });
    if (!existing) return res.status(404).json({ error: "Venue not found" });

    const { name, address, city, capacity } = req.body;
    const venue = await prisma.venue.update({
        where: { venue_id: id },
        data: { name, address, city, capacity }
    });
    return res.json(venue);
}
export async function deleteVenue(req: Request, res: Response) {
    const { id } = req.params;
    const existing = await prisma.venue.findUnique({ where: { venue_id: id } });
    if (!existing) return res.status(404).json({ error: "Venue not found" });

    await prisma.venue.delete({
        where: { venue_id: id }
    });
    return res.status(204).end();
}
