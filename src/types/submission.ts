import { z } from 'zod';

export const VenueSubmissionSchema = z.object({
  title: z.string().min(1, 'Event title is required').max(200, 'Title is too long'),
  venueName: z.string().min(1, 'Venue name is required').max(200, 'Venue name is too long'),
  address: z.string().min(1, 'Address is required').max(300, 'Address is too long'),
  startAt: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: 'Valid start date and time is required',
  }),
  ticketUrl: z.string().url('Valid ticket URL is required'),
  submitterEmail: z.string().email('Valid email address is required'),
});

export type VenueSubmissionPayload = z.infer<typeof VenueSubmissionSchema>;
