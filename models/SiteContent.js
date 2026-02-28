/**
 * Site Content - editable landing/blog content
 */
import mongoose from 'mongoose';

const siteContentSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'site', unique: true },
    landing: {
      heroTitle: { type: String, default: '' },
      heroDescription: { type: String, default: '' },
      ctaPrimary: { type: String, default: '' },
      ctaSecondary: { type: String, default: '' },
      communitySubtitle: { type: String, default: '' },
    },
    blog: {
      posts: {
        type: [
          {
            title: { type: String, default: '' },
            date: { type: String, default: '' },
            summary: { type: String, default: '' }
          }
        ],
        default: []
      }
    }
  },
  { timestamps: true }
);

const SiteContent = mongoose.model('SiteContent', siteContentSchema);
export default SiteContent;
